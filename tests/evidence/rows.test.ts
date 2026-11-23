/*
 * Progress as rows (REDESIGN 2.3, 2.4): each ledger event read as a dated row in words, newest first, with the words for how an attempt
 * came out taken from src/progress/words.ts. The rows derive from the events and the compiled map and store nothing.
 */
import { describe, expect, test } from 'bun:test'
import type { LedgerEvent } from '@es/ledger'
import { activityRows, attemptCounts, dayWords, runGuesses, skillCounts } from '@/evidence/rows'
import { ATTEMPT_WORDS } from '@/progress/words'
import { MAP } from '../map/support'
import { lessonName } from '@/progress/next'
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

  test('names what a question asked about when the page can say it', () => {
    const events = [at('item', 'i1', { ref: 'item:gen/tr2.bubble-width/async-off' }), at('item', 'i2', { ref: 'item:gen/nowhere/none' })]
    const itemName = (family: string, variant: string) => (family === 'tr2.bubble-width' && variant === 'async-off' ? 'The gap with async scheduling off' : undefined)
    const rows = activityRows(events, { lessons: LESSONS, levelName: names, itemName })
    expect(rows.find((row) => row.id === 'i1')?.what).toBe('Answered a question: The gap with async scheduling off')
    expect(rows.find((row) => row.id === 'i2')?.what).toBe('Answered a question')
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

  test('reads a run proved with the agent closed as proved, and a graded run played with it open as it was', () => {
    const [proved, unseen, practice] = ['proved', 'unseen', 'practice'].map(
      (provenance, n) => activityRows([at('play', `g${n}`, { ref: 'play:loop/close', ok: true, provenance })], { lessons: LESSONS, levelName: names })[0],
    )
    expect(proved.what).toBe('Played Step loop, close, agent closed')
    expect(proved.result).toBe(ATTEMPT_WORDS.yes)
    expect(unseen.what).toBe('Played Step loop, close')
    expect(practice.what).toBe('Played Step loop, close')
  })

  test('reads a run left before its end as left, a miss that is in the log, and a run that ended as played', () => {
    const left = { ...at('play', 'g9', { ref: 'play:loop/close', ok: false, provenance: 'proved' }), data: { actions: '[]', actionsSha256: 'a'.repeat(64), left: '2026-11-20T09:00:00.000Z' } } as LedgerEvent
    const [row] = activityRows([left], { lessons: LESSONS, levelName: names })
    expect(row.what).toBe('Left Step loop, close, agent closed, before its end')
    expect(row.result).toBe(ATTEMPT_WORDS.no)
    const [plain] = activityRows([{ ...left, provenance: 'unseen' } as LedgerEvent], { lessons: LESSONS, levelName: names })
    expect(plain.what).toBe('Left Step loop, close, before its end')
  })

  test('leaves out an acknowledgement, which carries no result', () => {
    expect(activityRows([copy(EXAMPLES.ack) as LedgerEvent], { lessons: LESSONS, levelName: names })).toEqual([])
  })

  test('says a GPU lab result as passed, in practice or not counted, and a challenge as issued', () => {
    const rows = activityRows([copy(EXAMPLES.receipt) as LedgerEvent, copy(EXAMPLES.challenge) as LedgerEvent], { lessons: LESSONS, levelName: names })
    expect(rows.map((row) => row.what).every((what) => /lab result|challenge/.test(what))).toBe(true)
    expect(rows.some((row) => row.result === 'issued')).toBe(true)
  })

  test('shows no id, no kind and no build-log word in any row', () => {
    const all = Object.values(EXAMPLES).map((example, n) => ({ ...copy(example), id: `e${n}` }) as LedgerEvent)
    for (const row of activityRows(all, { lessons: LESSONS, levelName: names })) {
      expect(`${row.what} ${row.result} ${row.where ?? ''}`).not.toMatch(/\b(?:tr\d\.|item:|play:|predict:)|\bW\d|\bR-T\d|\bD-0\d/)
    }
  })
})

describe('a row reads the record rightly', () => {
  const rowOf = (event: LedgerEvent) => activityRows([event], { lessons: LESSONS, levelName: names })[0]

  test('a guess that is the answer itself reads exact, a right one within the bar close, a wrong one off', () => {
    const guess = (ok: boolean, value: unknown, truth: unknown) => rowOf(at('predict', 'p', { ok, data: { value, truth, unit: 'us' } })).result
    expect(guess(true, 312, 312)).toBe('exact')
    expect(guess(true, 300, 312)).toBe('close')
    expect(guess(false, 300, 312)).toBe('off')
    expect(guess(true, 'b', 'b')).toBe('exact')
    expect(guess(true, { lo: 3, hi: 3 }, 3)).toBe('exact')
    expect(guess(true, { lo: 2, hi: 4 }, 3)).toBe('close')
  })

  test('the in-run guess of a run is in its row, once per commit', () => {
    const actions = JSON.stringify([{ t: 'commit', prediction: 1 }, { t: 'step' }, { t: 'commit', prediction: 3 }])
    expect(rowOf(at('play', 'g', { ref: 'play:loop/close', data: { actions, actionsSha256: 'a'.repeat(64) } })).what).toBe('Played Step loop, close, guessing 1 and 3 before the moves')
    expect(runGuesses('not json')).toEqual([])
    expect(runGuesses('[{"t":"step"}]')).toEqual([])
  })

  test('a question is filed under the lesson it was answered in, when two lessons ask its family', () => {
    const one = LESSONS[0]
    const two = { ...one, id: `${one.id}.b`, route: `${one.route}-b` }
    const row = { family: 'fam.shared', count: 1 }
    const lessons = [
      { ...one, run: [], inline: [], test: { ...one.test, graded: [], questions: [row] }, checkpoints: [] },
      { ...two, run: ['play:loop/close'], inline: [], test: { ...two.test, graded: [], questions: [row] }, checkpoints: [] },
    ] as typeof LESSONS
    const events = [
      at('play', 'g', { ref: 'play:loop/close', at: '2026-11-04T09:00:00.000Z' }),
      at('item', 'q', { ref: 'item:gen/fam.shared/v', at: '2026-11-04T10:00:00.000Z' }),
    ]
    const where = activityRows(events, { lessons, levelName: names }).find((r) => r.id === 'q')?.where
    expect(where).toBe(lessonName(lessons[1], lessons))
    expect(where).not.toBe(lessonName(lessons[0], lessons))
  })

  test('a lab row carries the lab`s name', () => {
    expect(rowOf(at('lab-check', 'l', { ref: 'lab:hybrid-kv' })).what).toBe('Checked “Build a hybrid KV cache manager” in this browser')
    expect(rowOf(at('lab-check', 'l', { ref: 'lab:nowhere' })).what).toBe('Checked a lab in this browser')
  })

  test('a run at part weight on a graded level is a practice row', () => {
    const lessons = LESSONS.map((lesson, n) => (n === 0 ? { ...lesson, test: { ...lesson.test, graded: ['play:loop/close'] } } : lesson))
    const row = (provenance: string) => activityRows([at('play', 'g', { ref: 'play:loop/close', provenance })], { lessons, levelName: names })[0].kind
    expect(row('unseen')).toBe('graded')
    expect(row('practice')).toBe('practice')
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
