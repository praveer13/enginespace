/*
 * W1-T05: what Today says (src/items/today/copy.ts), held to the rule it keeps. ASSESSMENT §8: "a welcome-back set after 7 idle days and
 * never an overdue count" (kernelspace K2). The page never says how much is due or late or left undone, never scolds, and a welcome-back
 * carries no number at all. kernelspace held the same line with a test on its own copy.
 */
import { describe, expect, test } from 'bun:test'
import * as copy from '../../src/items/today/copy'

/** The words of a backlog: none may appear anywhere in what the page says. */
const BACKLOG = /\b(?:overdue|over-due|behind|backlog|late|lapsed|missed out|catch[- ]up|debt|streak|pile[sd]? up|falling|forgot(?:ten)?|you have \d+|\d+ (?:ideas|cards|items|tickets) (?:are|is)? ?(?:due|waiting|left))\b/i

const STRINGS: [string, string][] = Object.entries(copy).flatMap(([name, value]) => (typeof value === 'string' ? [[name, value] as [string, string]] : []))

describe('what Today says', () => {
  test('says something in each of its constants, and every one is a sentence or a label and not a stray', () => {
    expect(STRINGS.length).toBeGreaterThan(20)
    for (const [name, text] of STRINGS) {
      expect(text.trim(), name).toBe(text)
      expect(text.length, name).toBeGreaterThan(2)
    }
  })

  test('never speaks of what is overdue, late or left, in any constant or any line it builds', () => {
    for (const [name, text] of STRINGS) expect(text, name).not.toMatch(BACKLOG)
    const built = [
      copy.nextPrep('2026-11-06'),
      copy.backLine('2026-11-06'),
      copy.placeLine(2, 9),
      copy.tallyLine(7, 9),
      copy.modeNote('due') ?? '',
      copy.modeNote('welcome-back') ?? '',
      copy.modeNote('ahead') ?? '',
      copy.listTitle('due'),
      copy.listTitle('ahead'),
      copy.lineStatus('waiting'),
      copy.lineStatus('now'),
      copy.lineStatus('done', true),
      copy.lineStatus('done', false),
    ]
    for (const text of built) expect(text, text).not.toMatch(BACKLOG)
  })

  test('a welcome-back carries no number at all, and neither does the rest\'s account of itself', () => {
    expect(copy.WELCOME_BACK).not.toMatch(/\d/)
    expect(copy.AHEAD_NOTE).not.toMatch(/\d/)
    expect(copy.REST_TITLE).not.toMatch(/\d/)
    expect(copy.REST_AHEAD).not.toMatch(/\d/)
    expect(copy.EMPTY_BODY).not.toMatch(/\d/)
    expect(copy.PAGE_LEAD).not.toMatch(/\d/)
  })

  test('is kind to a miss: a done line says it was missed in one word, and a miss comes back sooner and is told so by the day alone', () => {
    expect(copy.lineStatus('done', false)).toBe('done, missed')
    expect(copy.lineStatus('done', true)).toBe('done, right')
    expect(copy.tallyLine(0, 4)).toBe('0 of 4 right')
  })

  test('says the day a thing comes back the way the printer writes a day', () => {
    expect(copy.backLine('2026-11-06')).toBe('back Fri 6 Nov')
    expect(copy.nextPrep('2026-11-06')).toBe('Your next prep is Fri 6 Nov.')
    expect(copy.placeLine(0, 3)).toBe('Item 1 of 3')
  })

  test('names the modes of a list, and a plain one has no note', () => {
    expect(copy.modeNote('due')).toBeNull()
    expect(copy.modeNote('welcome-back')).toBe(copy.WELCOME_BACK)
    expect(copy.modeNote('ahead')).toBe(copy.AHEAD_NOTE)
    expect(copy.listTitle('due')).toBe('Prep list')
    expect(copy.listTitle('welcome-back')).toBe('Prep list')
    expect(copy.listTitle('ahead')).toBe('Review ahead')
  })

  test('asks for the actions by what they do', () => {
    expect([copy.START_PREP, copy.CHECK_TICKET, copy.NEXT_TICKET, copy.FINISH_PREP, copy.MORE_PREP, copy.START_AHEAD]).toEqual([
      'Start the prep',
      'Check the ticket',
      'Next ticket',
      'Finish the prep',
      'Prep another list',
      'Review ahead',
    ])
  })
})
