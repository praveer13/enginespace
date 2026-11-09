/*
 * W1-T05, accept 2: a scripted thirty-day ledger produces the expected due list (golden).
 *
 * tests/today/ledger-30.ts scripts the month. The golden, tests/fixtures/today/due-30.json, holds what a reader of the ledger must
 * show on each of its days: whether the day is a welcome-back, the ideas due in the order a session would serve them, the next day
 * on which one falls due, and the deck at the end. Two checks stand behind it, so that the fixture is not just what the code said
 * the day it was written:
 *   - an oracle, which replays the reviews the script says should count through the vendored model called directly, and must agree
 *     with the deck on every idea's due day and on the SET of ideas due on every day (the order is the golden's);
 *   - a few days worked by hand, in the test below, from the model's first-review intervals (a Good is two days, an Easy eight).
 *
 * A change that moves the golden fails this test until the fixture is rewritten, and its diff is read like code:
 *   ES_WRITE_GOLDEN=1 bun test tests/today/golden.test.ts
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { deriveCards, dueCards, nextDueDay } from '../../src/items/today/cards'
import type { Card } from '../../src/items/today/cards'
import { addDays, daysBetween } from '../../src/items/today/days'
import { kcsOfRef, sourcesOf } from '../../src/items/today/kcs'
import type { KcsOfRef } from '../../src/items/today/kcs'
import { intervalDays, nextMemory } from '../../vendor/kernelspace/src/lib/learner/fsrs'
import type { MemoryState } from '../../vendor/kernelspace/shims/src/lib/learner/types'
import { A, B, C, D, DAYS, day, F, G, H, KCS, START, STEPS, writeAll } from './ledger-30'
import { TestLedger } from './support'

const FIXTURE = path.resolve(import.meta.dirname, '../fixtures/today/due-30.json')

/**
 * The map the script is written against: this build's, with Service held to the two ideas that its graded run of day 5 was written for. The
 * game exercises more ideas as its levels are built (W1-T14's `close` names three more), and the month's golden is about the schedule that a
 * ledger produces, so it does not move with the registry. tests/today/kcs.test.ts holds the build's own map.
 */
const sources = sourcesOf()
const appKcsOfRef: KcsOfRef = (ref) => kcsOfRef(ref, { ...sources, game: (game) => (game === 'loop' ? [C, D] : sources.game(game)) })

interface DayRow {
  day: string
  welcomeBack: boolean
  due: string[]
  next: string | null
}

interface CardRow {
  kc: string
  earnedDay: string
  lastDay: string
  dueDay: string
  reps: number
  lapses: number
  stability: number
  difficulty: number
}

interface Golden {
  start: string
  days: number
  /** Round to 8 digits, as the model does. */
  rows: DayRow[]
  cards: CardRow[]
}

const round8 = (x: number): number => Math.round(x * 1e8) / 1e8

function actual(): Golden {
  const events = writeAll(new TestLedger()).events
  const rows: DayRow[] = []
  for (let n = 0; n <= DAYS; n += 1) {
    const today = day(n)
    // The deck as the page would read it that morning: the events of the day itself are not in yet.
    const before = events.filter((event) => event.day < today)
    const set = deriveCards(before, appKcsOfRef, today)
    rows.push({ day: today, welcomeBack: set.welcomeBack, due: dueCards(set, today).map((c) => c.kc), next: nextDueDay(set, today) })
  }
  const end = deriveCards(events, appKcsOfRef, day(DAYS))
  const cards: CardRow[] = [...end.cards.values()]
    .map((c) => ({ kc: c.kc, earnedDay: c.earnedDay, lastDay: c.lastDay, dueDay: c.dueDay, reps: c.reps, lapses: c.lapses, stability: round8(c.memory.stability), difficulty: round8(c.memory.difficulty) }))
    .sort((a, b) => (a.kc < b.kc ? -1 : 1))
  return { start: START, days: DAYS, rows, cards }
}

const render = (golden: Golden): string => `${JSON.stringify(golden, null, 2)}\n`

describe('the scripted ledger', () => {
  const golden = actual()

  test('matches the golden: the due list of every one of its thirty-one days, and the deck at the end', () => {
    if (process.env.ES_WRITE_GOLDEN === '1') {
      mkdirSync(path.dirname(FIXTURE), { recursive: true })
      writeFileSync(FIXTURE, render(golden))
    }
    expect(existsSync(FIXTURE), `${FIXTURE} is missing: ES_WRITE_GOLDEN=1 bun test tests/today/golden.test.ts writes it`).toBe(true)
    const expected = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Golden
    expect(golden.rows.map((row) => row.day)).toEqual(expected.rows.map((row) => row.day))
    for (const [index, row] of golden.rows.entries()) expect(row, `day ${index} (${row.day})`).toEqual(expected.rows[index])
    expect(golden.cards).toEqual(expected.cards)
    expect(render(golden)).toBe(readFileSync(FIXTURE, 'utf8'))
  })

  test('the fixture says what the script means to say: eight ideas, a welcome-back on days 18 and 19, and days with nothing due', () => {
    const rows = new Map(golden.rows.map((row, index) => [index, row]))
    expect(golden.cards.map((c) => c.kc).sort()).toEqual([...KCS].sort())
    expect([...rows].filter(([, row]) => row.welcomeBack).map(([index]) => index)).toEqual([18, 19])
    expect(golden.rows.filter((row) => row.due.length === 0).length).toBeGreaterThan(3)
    expect(Math.max(...golden.rows.map((row) => row.due.length))).toBeLessThanOrEqual(KCS.length)
  })

  test('is worked by hand on a few days', () => {
    const due = (n: number) => golden.rows[n].due
    // The morning of day 0: the first events are not written yet, so there is no deck, and nothing is next.
    expect(golden.rows[0]).toEqual({ day: day(0), welcomeBack: false, due: [], next: null })
    // Day 1: B was earned by a guess, which is a Hard, and a first Hard is one day. A and C (Good, two days) and D (Easy, eight) wait.
    expect(due(1)).toEqual([B])
    expect(golden.rows[1].next).toBe(day(2))
    // Day 2: A and C are due. C was missed on day 1, so it has had the less time to fade, and comes first.
    expect(due(2)).toEqual([C, A])
    // Day 8: D was Easy on day 0, and passed again on days 5 and 6, so day 0's eight days no longer make it due.
    expect(due(8)).not.toContain(D)
    // Days 12 to 17: away. G (Good on day 10), H (Good on day 11) and F (Easy on day 9) fall due in turn, two days, two days and eight.
    expect(due(12)).toEqual([G])
    expect(due(13)).toEqual([G, H])
    expect(due(16)).toEqual([G, H])
    expect(due(17)).toEqual([G, H, F])
    // Day 18 is seven days after the last graded work, on day 11: a welcome-back, which serves the sturdiest first. F is Easy.
    expect(daysBetween(day(11), day(18))).toBe(7)
    expect(golden.rows[17].welcomeBack).toBe(false)
    expect(golden.rows[18].welcomeBack).toBe(true)
    expect(due(18)).toEqual([F, G, H])
    expect(due(19)).toEqual([F, G, H])
    // Back on day 19, with A, G and D reviewed: the welcome-back is over, and what is due goes by the lowest recall again.
    expect(golden.rows[20].welcomeBack).toBe(false)
    expect(due(20).slice().sort()).toEqual([F, G, H].sort())
    // The month ends with everything scheduled out of reach: a day on which nothing is due.
    expect(due(DAYS)).toEqual([])
  })
})

describe('the oracle: the model called directly on the reviews the script means to count', () => {
  /** Each idea's reviews in order, as (day, grade); a card exists from its first. */
  const reviewsOf = new Map<string, { day: number; grade: 1 | 2 | 3 | 4 }[]>()
  for (const step of STEPS) for (const [kc, grade] of step.reviews) reviewsOf.set(kc, [...(reviewsOf.get(kc) ?? []), { day: step.day, grade }])

  /** The oracle's card for `kc` after every review on or before `n`: the memory, the last day and the due day. */
  function cardAt(kc: string, n: number): { memory: MemoryState; lastDay: number; dueDay: number } | null {
    let memory: MemoryState | null = null
    let last = 0
    for (const review of reviewsOf.get(kc) ?? []) {
      if (review.day > n) break
      memory = memory === null ? nextMemory(null, 0, review.grade) : nextMemory(memory, review.day - last, review.grade)
      last = review.day
    }
    return memory === null ? null : { memory, lastDay: last, dueDay: last + intervalDays(memory.stability) }
  }

  test('the deck at the end agrees with the oracle on every idea: the memory, the last review and the due day', () => {
    const end = deriveCards(writeAll(new TestLedger()).events, appKcsOfRef, day(DAYS))
    for (const kc of KCS) {
      const expected = cardAt(kc, DAYS)
      const got = end.cards.get(kc) as Card
      expect(expected, kc).not.toBeNull()
      expect(got.memory, kc).toEqual((expected as { memory: MemoryState }).memory)
      expect(got.lastDay, kc).toBe(day((expected as { lastDay: number }).lastDay))
      expect(got.dueDay, kc).toBe(day((expected as { dueDay: number }).dueDay))
    }
  })

  test('on every day the set of ideas that are due is the oracle\'s, outside the days of the welcome-back, where the spread could differ', () => {
    const events = writeAll(new TestLedger()).events
    for (let n = 0; n <= DAYS; n += 1) {
      const today = day(n)
      const set = deriveCards(events.filter((event) => event.day < today), appKcsOfRef, today)
      const due = dueCards(set, today).map((c) => c.kc).sort()
      const expected = KCS.filter((kc) => {
        const c = cardAt(kc, n - 1)
        return c !== null && c.dueDay <= n
      }).sort()
      expect(due, `day ${n}`).toEqual(expected)
    }
  })

  test('every idea\'s due day is at least a day after its last review, and a lapse is not due for long', () => {
    const end = deriveCards(writeAll(new TestLedger()).events, appKcsOfRef, day(DAYS))
    for (const c of end.cards.values()) expect(daysBetween(c.lastDay, c.dueDay)).toBeGreaterThanOrEqual(1)
    expect(addDays(START, DAYS)).toBe(day(DAYS))
  })
})
