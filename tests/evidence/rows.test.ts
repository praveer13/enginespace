/*
 * Progress as rows (REDESIGN 2.3, 2.4): each ledger event read as a dated row in words, newest first, with the words for how an attempt
 * came out taken from src/progress/words.ts. The rows derive from the events and the compiled map and store nothing.
 */
import { describe, expect, test } from 'bun:test'
import type { LedgerEvent } from '@es/ledger'
import { activityRows, attemptCounts, dayWords, skillCounts } from '@/evidence/rows'
import { ATTEMPT_WORDS } from '@/progress/words'
import { MAP } from '../map/support'
import { copy, EXAMPLES } from '../ledger/support'

const LESSONS = MAP.lessons
const names = (game: string, level: string) => (game === 'loop' ? `Step loop, ${level}` : undefined)
const at = (kind: keyof typeof EXAMPLES, id: string, patch: Record<string, unknown>) => ({ ...copy(EXAMPLES[kind]), id, ...patch }) as LedgerEvent

describe('dayWords', () => {
  test('says a day as day, month and year, from its own digits', () => {
    expect(dayWords('2026-11-04')).toBe('4 Nov 2026')
    expect(dayWords('2026-01-31')).toBe('31 Jan 2026')
  })

  test('leaves what is not a day as it is', () => {
    expect(dayWords('soon')).toBe('soon')
  })
})

describe('activityRows', () => {
  test('lists the newest first, each with the day, what was done and how it came out', () => {
    const events = [
      at('play', 'g1', { at: '2026-11-04T09:30:00.000Z', day: '2026-11-04' }),
      at('item', 'i1', { at: '2026-11-05T09:30:00.000Z', day: '2026-11-05' }),
    ]
    const rows = activityRows(events, { lessons: LESSONS, levelName: names })
    expect(rows.map((row) => row.id)).toEqual(['i1', 'g1'])
    expect(rows[0]).toMatchObject({ day: '2026-11-05', what: 'Answered a question', result: ATTEMPT_WORDS.no })
    expect(rows[1].what).toMatch(/^Played /)
  })

  test('says a pass at part weight as a pass in practice, and a pass at full weight as passed', () => {
    const rows = activityRows(
      [at('item', 'a', { ok: true, provenance: 'practice' }), at('item', 'b', { ok: true, provenance: 'unseen', at: '2026-11-04T10:30:00.000Z' })],
      { lessons: LESSONS, levelName: names },
    )
    expect(Object.fromEntries(rows.map((row) => [row.id, row.result]))).toEqual({ a: ATTEMPT_WORDS.practice, b: ATTEMPT_WORDS.yes })
  })

  test('names a level by the engine`s title, and never by its id', () => {
    const [row] = activityRows([at('play', 'g1', { ref: 'play:loop/close' })], { lessons: LESSONS, levelName: names })
    expect(row.what).toBe('Played Step loop, close')
    const [unnamed] = activityRows([at('play', 'g2', { ref: 'play:nowhere/x' })], { lessons: LESSONS, levelName: names })
    expect(unnamed.what).toBe('Played a level')
  })

  test('leaves out an acknowledgement, which carries no result', () => {
    expect(activityRows([copy(EXAMPLES.ack) as LedgerEvent], { lessons: LESSONS, levelName: names })).toEqual([])
  })

  test('says a GPU lab result as passed, in practice or not counted, and a challenge as issued', () => {
    const rows = activityRows([copy(EXAMPLES.receipt) as LedgerEvent, copy(EXAMPLES.challenge) as LedgerEvent], { lessons: LESSONS, levelName: names })
    expect(rows.map((row) => row.what).every((what) => /GPU lab result|challenge/.test(what))).toBe(true)
    expect(rows.some((row) => row.result === 'issued')).toBe(true)
  })

  test('shows no id, no kind and no build-log word in any row', () => {
    const all = Object.values(EXAMPLES).map((example, n) => ({ ...copy(example), id: `e${n}` }) as LedgerEvent)
    for (const row of activityRows(all, { lessons: LESSONS, levelName: names })) {
      expect(`${row.what} ${row.result} ${row.where ?? ''}`).not.toMatch(/\b(?:tr\d\.|item:|play:|predict:)|\bW\d|\bR-T\d|\bD-0\d/)
    }
  })
})

describe('the counts', () => {
  test('attempts are counted as not yet, passed in practice and passed, and a guess or a challenge is not one', () => {
    const counts = attemptCounts([
      at('item', 'a', { ok: false }),
      at('item', 'b', { ok: true, provenance: 'practice' }),
      at('item', 'c', { ok: true, provenance: 'unseen' }),
      copy(EXAMPLES.predict) as LedgerEvent,
      copy(EXAMPLES.challenge) as LedgerEvent,
    ])
    expect(counts).toEqual({ notYet: 1, practice: 1, passed: 1 })
  })

  test('skills are the words for a skill, each counted once: the states of the graph include the ones before them', () => {
    expect(skillCounts({ total: 10, practised: 4, earned: 2, kept: 1 })).toEqual({ total: 10, notStarted: 6, tried: 2, passed: 1, kept: 1 })
  })
})
