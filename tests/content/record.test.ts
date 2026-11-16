/*
 * R-T10: what a lesson page tells back from the ledger (REDESIGN §2.5): the lesson record that closes Keep, the rail's answers and the Test's
 * tally. Every line is a reading of events, on a fixture ledger here, and nothing is stored: the functions are pure and take the events.
 */
import { describe, expect, test } from 'bun:test'
import type { LedgerEvent } from '@es/ledger'
import type { MapLesson } from '@es/schema'
import { guessLines, lessonEvents, lessonRecord, runLines, tally, tallyWords } from '@/content/render/record'
import { made } from '../progress/support'

const REV = 'a'.repeat(64)
const ROW: MapLesson = {
  id: 'tr5a.l1',
  module: 'tr5a',
  route: '/m/tr5a/l1-why-one-model-needs-several-kv-caches',
  title: 'Why one model needs several KV caches',
  minutes: 95,
  needs: ['B'],
  rev: REV,
  opener: 'run',
  run: ['play:pool/one-group', 'play:pool/two-kinds'],
  inline: [],
  predicts: ['predict:tr5a.l1#tr5a.l1.p1'],
  checkpoints: [],
  test: { questions: [{ family: 'tr5a.blocks-held', count: 3 }], graded: [] },
  anchors: { read: 'what-the-next-token-reads', test: 'exit-check' },
}
const OTHER: MapLesson = { ...ROW, id: 'tr5a.l2', route: '/m/tr5a/l2-other', run: [], opener: 'read', predicts: [], test: { questions: [{ family: 'tr5a.other', count: 3 }], graded: [] } }
const LESSONS = [ROW, OTHER]
const NAMES = (game: string, level: string) => (game === 'pool' ? { 'one-group': 'One KV group', 'two-kinds': 'Full attention and a sliding window' }[level] : undefined)

/** A guess's event, with the value and the truth the reveal wrote. */
function guess(value: number, truth: number, conf?: 'guess' | 'think' | 'sure'): LedgerEvent {
  const event = made('predict', 'predict:tr5a.l1#tr5a.l1.p1', { ok: false }) as unknown as Record<string, unknown>
  return { ...event, data: { value, truth, unit: 'pages' }, ...(conf === undefined ? {} : { conf }) } as unknown as LedgerEvent
}

const LEDGER: LedgerEvent[] = [
  guess(300, 260, 'think'),
  made('play', 'play:pool/one-group', { provenance: 'practice' }),
  made('play', 'play:pool/two-kinds', { provenance: 'practice', ok: false }),
  made('item', 'item:gen/tr5a.blocks-held/v1', { day: 1 }),
  made('item', 'item:gen/tr5a.blocks-held/v2', { day: 1 }),
  made('item', 'item:gen/tr5a.blocks-held/v1', { day: 1 }),
  made('item', 'item:gen/tr5a.other/v1', { day: 1 }),
]

describe('the lesson record', () => {
  test('its lines come from the ledger’s events: the guess beside the model, each run in words, and the questions', () => {
    expect(lessonRecord(ROW, LESSONS, LEDGER, NAMES)).toEqual([
      'TR5a lesson 1',
      'guess 300 pages (think so), model 260 pages',
      'One KV group: passed in practice',
      'Full attention and a sliding window: not yet',
      'questions 3 of 3 passed',
    ])
  })

  test('another lesson’s events are not this lesson’s', () => {
    expect(lessonEvents(LEDGER, LESSONS, 'tr5a.l1')).toHaveLength(6)
    expect(lessonEvents(LEDGER, LESSONS, 'tr5a.l2')).toHaveLength(1)
  })

  test('with no events it has the lesson’s name and a line that says what adds to it, and no level is named by its id', () => {
    const lines = lessonRecord(ROW, LESSONS, [], NAMES)
    expect(lines).toEqual(['TR5a lesson 1', 'nothing yet: a run, a guess and the questions each add a line'])
    const unnamed = lessonRecord(ROW, LESSONS, [made('play', 'play:pool/one-group')], () => undefined)
    expect(unnamed[1]).toBe('a level: passed')
  })

  test('the same events always give the same lines, and reading them changes nothing', () => {
    const frozen = Object.freeze(LEDGER.map((event) => Object.freeze({ ...event })))
    expect(lessonRecord(ROW, LESSONS, frozen, NAMES)).toEqual(lessonRecord(ROW, LESSONS, frozen, NAMES))
  })
})

describe('the rail’s answers and the Test’s tally', () => {
  const own = lessonEvents(LEDGER, LESSONS, 'tr5a.l1')

  test('the learner’s own answer: "you said 300 pages", and each run in words, best attempt first', () => {
    expect(guessLines(own).map((line) => line.said)).toEqual(['you said 300 pages'])
    const again = [...own, made('play', 'play:pool/two-kinds', { provenance: 'practice' })]
    expect(runLines(again, ROW.run, NAMES).map((line) => line.text)).toEqual(['One KV group: passed in practice', 'Full attention and a sliding window: passed in practice'])
  })

  test('"3 of 3: passed", and "1 of 3: not yet. New numbers when you retry."', () => {
    expect(tallyWords(tally(ROW, own))).toBe('3 of 3: passed')
    const once = [made('item', 'item:gen/tr5a.blocks-held/v1', { ok: false }), made('item', 'item:gen/tr5a.blocks-held/v1', { day: 1 })]
    const count = tally(ROW, once)
    expect(count).toEqual({ right: 1, of: 3, passed: false, tried: true })
    expect(tallyWords(count)).toBe('1 of 3: not yet. New numbers when you retry.')
  })

  test('a practice pass is not a pass of the Test', () => {
    const practice = [1, 2, 3].map(() => made('item', 'item:gen/tr5a.blocks-held/v1', { provenance: 'practice' }))
    expect(tally(ROW, practice).passed).toBe(false)
  })
})
