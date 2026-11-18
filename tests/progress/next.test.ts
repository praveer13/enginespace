/*
 * R-T06: the way on (REDESIGN §2.4). `nextStep(events, lessons, bookmark)` is pure and answers what is next by five rules, one test each
 * below; `lastTime` tells progress back as a sentence; a run or a question that several lessons could own goes to the one whose rev it
 * carries; and a lesson's Test is passed only by full-weight answers and a passing graded run.
 *
 * The rules run on a small table written here, so each test says exactly what it is about, and then on the compiled map, so the course's
 * own first step is held: TR1 lesson 1, and the header's pointer before any page has written one (START_POINTER) is that answer.
 */
import { describe, expect, test } from 'bun:test'
import type { LedgerEvent } from '@es/ledger'
import type { CourseMap, MapLesson } from '@es/schema'
import { attemptWord, indexLessons, lastTime, nextStep, ownersOf, standings } from '@/progress/next'
import type { Bookmark } from '@/progress/next'
import { START_POINTER } from '@/settings/store'
import { repoOutput } from '../content/support'
import { isoAt, made } from './support'

const REV = (n: number) => n.toString(16).padStart(64, '0')

function lesson(id: string, slug: string, over: Partial<MapLesson> = {}): MapLesson {
  const module = id.split('.')[0]
  return {
    id,
    module,
    route: `/m/${module}/${slug}`,
    title: `Title of ${id}`,
    minutes: 30,
    needs: ['B'],
    rev: REV(1),
    opener: 'read',
    run: [],
    inline: [],
    predicts: [],
    checkpoints: [],
    test: { questions: [{ family: `${id.replace('.', '-')}.q`, count: 3 }], graded: [] },
    anchors: { read: 'first-part', test: 'exit-check' },
    ...over,
  }
}

/*
 * A course of five lessons:
 *   tr1.l1  opens on a run of `engine-floor/nano`, its Test three questions of tr1.q1
 *   tr1.l2  reads first, its Test three questions of tr1.q2
 *   tr2.l5  inline `loop/graphs`, its Test three of tr2.q5
 *   tr2.l6  inline `loop/graphs` too, its Test three of tr2.q6 and the graded `loop/close`
 *   tr2.l7  its Test three of tr2.q7
 */
const L1 = lesson('tr1.l1', 'l1-first', { opener: 'run', run: ['play:engine-floor/nano'], test: { questions: [{ family: 'tr1.q1', count: 3 }], graded: [] }, rev: REV(11) })
const L2 = lesson('tr1.l2', 'l2-second', { test: { questions: [{ family: 'tr1.q2', count: 3 }], graded: [] }, rev: REV(12) })
const L5 = lesson('tr2.l5', 'l5-graphs', { inline: ['play:loop/graphs'], test: { questions: [{ family: 'tr2.q5', count: 3 }], graded: [] }, rev: REV(25) })
const L6 = lesson('tr2.l6', 'l6-keys', { inline: ['play:loop/graphs', 'play:loop/close'], test: { questions: [{ family: 'tr2.q6', count: 3 }], graded: ['play:loop/close'] }, rev: REV(26) })
const L7 = lesson('tr2.l7', 'l7-elsewhere', { test: { questions: [{ family: 'tr2.q7', count: 3 }], graded: [] }, rev: REV(27) })
const COURSE = [L1, L2, L5, L6, L7]

/** Three right answers at full weight to a family, on day `day`. */
const passes = (family: string, day = 0) => [1, 2, 3].map(() => made('item', `item:gen/${family}/v1`, { day }))
/** A play event, on a lesson's rev or on none. */
const play = (ref: string, opts: { rev?: string; ok?: boolean; provenance?: 'unseen' | 'practice'; day?: number } = {}): LedgerEvent =>
  ({ ...made('play', ref, { ok: opts.ok ?? true, provenance: opts.provenance ?? 'practice', day: opts.day ?? 0 }), ...(opts.rev === undefined ? {} : { rev: opts.rev }) }) as LedgerEvent
const doneWith = (lesson: MapLesson, day = 0): LedgerEvent[] => [...lesson.test.questions.flatMap((row) => passes(row.family, day)), ...lesson.test.graded.map((ref) => play(ref, { provenance: 'unseen', day }))]

describe('nextStep, rule by rule', () => {
  test('rule 1: an empty ledger and no bookmark give the first section of the first lesson, as Start', () => {
    const step = nextStep([], COURSE, null)
    expect(step).toMatchObject({ href: L1.route, label: 'Start: TR1 lesson 1', word: 'Start', minutes: 30, place: 'lesson', lesson: 'tr1.l1', skipped: 0 })
  })

  test('rule 3, first: an unfinished lesson whose opener has not run gives its Run', () => {
    const step = nextStep([made('predict', 'predict:tr1.l1#tr1.l1.p1')], COURSE, null)
    expect(step).toMatchObject({ place: 'run', lesson: 'tr1.l1', href: L1.route, label: 'Continue: TR1 lesson 1, the run', word: 'Continue' })
  })

  test("rule 3, second: with its Run done, the bookmark's part when the bookmark is in it", () => {
    const events = [play('play:engine-floor/nano', { rev: L1.rev })]
    const mark: Bookmark = { route: L1.route, section: 'read', part: 'the-gap', title: 'The gap, and its name', at: isoAt(1) }
    const step = nextStep(events, COURSE, mark)
    expect(step).toMatchObject({ place: 'part', href: `${L1.route}#the-gap`, label: 'Continue: TR1 lesson 1, The gap, and its name', reason: 'pick up at The gap, and its name' })
  })

  test('rule 3, third: with no bookmark in it and no Test attempt, the first part of Read', () => {
    const events = [play('play:engine-floor/nano', { rev: L1.rev })]
    const step = nextStep(events, COURSE, null)
    expect(step).toMatchObject({ place: 'read', href: `${L1.route}#first-part`, label: 'Continue: TR1 lesson 1, read why', reason: 'read why, then 3 questions' })
    // A bookmark in another lesson, older than the run, does not pull the answer there.
    const elsewhere: Bookmark = { route: L2.route, part: 'x', at: isoAt(-1) }
    expect(nextStep(events, COURSE, elsewhere).place).toBe('read')
  })

  test('rule 3, fourth: once the Test has an attempt that has not passed, its Test', () => {
    const events = [play('play:engine-floor/nano', { rev: L1.rev }), made('item', 'item:gen/tr1.q1/v1', { ok: false })]
    const step = nextStep(events, COURSE, null)
    expect(step).toMatchObject({ place: 'test', href: `${L1.route}#exit-check`, label: 'Continue: TR1 lesson 1, the questions', reason: 'retry the questions' })
  })

  test('rule 2: the later of the most recent event and the bookmark is the lesson worked on', () => {
    const events = [made('predict', 'predict:tr1.l2#tr1.l2.p1', { day: 0 })]
    const later: Bookmark = { route: L5.route, section: 'read', part: 'capture', at: isoAt(2) }
    expect(nextStep(events, COURSE, later)).toMatchObject({ lesson: 'tr2.l5', place: 'part' })
    const earlier: Bookmark = { ...later, at: isoAt(-2) }
    expect(nextStep(events, COURSE, earlier)).toMatchObject({ lesson: 'tr1.l2', place: 'read' })
  })

  test('rule 4: a done lesson gives the next lesson after it that is not done, and skipped counts the earlier ones', () => {
    // Lesson 5 (tr2.l5) done out of order: the answer is tr2.l6, not tr1.l1, and the two TR1 lessons are skipped.
    const step = nextStep(doneWith(L5), COURSE, null)
    expect(step).toMatchObject({ lesson: 'tr2.l6', place: 'lesson', href: L6.route, label: `Continue: TR2 lesson 2, ${L6.title}`, minutes: 30, skipped: 2 })
    // And a done lesson after it is passed over too.
    expect(nextStep([...doneWith(L6, 0), ...doneWith(L5, 1)], COURSE, null)).toMatchObject({ lesson: 'tr2.l7', skipped: 2 })
  })

  test('rule 5: nothing left after the current lesson gives the first lesson not done; all done gives Review when due, else Course', () => {
    expect(nextStep(doneWith(L7), COURSE, null)).toMatchObject({ lesson: 'tr1.l1', skipped: 0 })
    const all = COURSE.flatMap((one, day) => doneWith(one, day))
    expect(nextStep(all, COURSE, null)).toMatchObject({ href: '/map', place: 'course', lesson: null })
    expect(nextStep(all, COURSE, null, { due: 3 })).toMatchObject({ href: '/today', place: 'review', label: 'Continue: Review', reason: '3 reviews due' })
  })

  test('reviews due never change the answer while a lesson is not done', () => {
    const cases: LedgerEvent[][] = [[], [made('predict', 'predict:tr1.l1#tr1.l1.p1')], doneWith(L5), [play('play:engine-floor/nano'), made('item', 'item:gen/tr1.q1/v1', { ok: false })]]
    for (const events of cases) expect(nextStep(events, COURSE, null, { due: 7 })).toEqual(nextStep(events, COURSE, null))
  })

  test('is pure: the same events, table and bookmark give the same answer, and the inputs are not changed', () => {
    const events = Object.freeze([...doneWith(L5), made('predict', 'predict:tr2.l6#tr2.l6.p1', { day: 1 })])
    const mark: Bookmark = Object.freeze({ route: L6.route, part: 'keys', at: isoAt(1) })
    const once = JSON.stringify(nextStep(events, COURSE, mark))
    expect(JSON.stringify(nextStep(events, COURSE, mark))).toBe(once)
    expect(nextStep.length).toBe(3)
  })

  test('deleting the bookmark changes the place only: progress and done are the same', () => {
    const events = [play('play:engine-floor/nano', { rev: L1.rev })]
    const mark: Bookmark = { route: L1.route, part: 'the-gap', at: isoAt(1) }
    const index = indexLessons(COURSE)
    expect(nextStep(events, COURSE, mark).lesson).toBe(nextStep(events, COURSE, null).lesson)
    expect([...standings(events, index).values()].map((one) => one.state)).toEqual(['started', 'not-started', 'not-started', 'not-started', 'not-started'])
  })

  test('an event no lesson owns is not a lesson worked on: a review alone gives the first lesson, as Continue', () => {
    expect(nextStep([made('review', 'review:tr2.bubble')], COURSE, null)).toMatchObject({ lesson: 'tr1.l1', place: 'lesson', word: 'Continue' })
  })
})

describe('an event that several lessons could own', () => {
  const index = indexLessons(COURSE)

  test('loop/graphs goes to the lesson whose rev it carries', () => {
    expect(ownersOf(play('play:loop/graphs', { rev: L6.rev }), index).map((one) => one.id)).toEqual(['tr2.l6'])
    expect(ownersOf(play('play:loop/graphs', { rev: L5.rev }), index).map((one) => one.id)).toEqual(['tr2.l5'])
  })

  test('with no matching rev (an older one, or a run on /play) it counts for both', () => {
    expect(ownersOf(play('play:loop/graphs', { rev: REV(99) }), index).map((one) => one.id)).toEqual(['tr2.l5', 'tr2.l6'])
    expect(ownersOf(play('play:loop/graphs'), index).map((one) => one.id)).toEqual(['tr2.l5', 'tr2.l6'])
  })

  test('the same holds on the compiled map: broken-bench/court in TR8 lessons 3 and 4', () => {
    const map = JSON.parse(repoOutput('src/content/generated/map.json')) as CourseMap
    const real = indexLessons(map.lessons)
    const l3 = map.lessons.find((one) => one.id === 'tr8.l3') as MapLesson
    const l4 = map.lessons.find((one) => one.id === 'tr8.l4') as MapLesson
    expect(ownersOf(play('play:broken-bench/court', { rev: l3.rev }), real).map((one) => one.id)).toEqual(['tr8.l3'])
    expect(ownersOf(play('play:broken-bench/court', { rev: l4.rev, provenance: 'unseen' }), real).map((one) => one.id)).toEqual(['tr8.l4'])
    expect(ownersOf(play('play:broken-bench/court'), real).map((one) => one.id)).toEqual(['tr8.l3', 'tr8.l4'])
    const g5 = map.lessons.find((one) => one.id === 'tr2.l5') as MapLesson
    expect(ownersOf(play('play:loop/graphs', { rev: g5.rev }), real).map((one) => one.id)).toEqual(['tr2.l5'])
    expect(ownersOf(play('play:loop/graphs'), real).map((one) => one.id)).toEqual(['tr2.l5', 'tr2.l6'])
  })

  test('for "last worked on", an unmatched event goes to the bookmark\'s lesson if it is one of them, else the earliest not done', () => {
    const run = play('play:loop/graphs', { day: 3 })
    expect(nextStep([run], COURSE, { route: L6.route, at: isoAt(1) }).lesson).toBe('tr2.l6')
    expect(nextStep([run], COURSE, null).lesson).toBe('tr2.l5')
    expect(nextStep([...doneWith(L5, 0), run], COURSE, null).lesson).toBe('tr2.l6')
  })
})

describe('a question set that several lessons ask', () => {
  // TR1 lessons 1, 3 and 6 all ask tr1.which-mechanism; lesson 6's Test asks it too.
  const map = JSON.parse(repoOutput('src/content/generated/map.json')) as CourseMap
  const index = indexLessons(map.lessons)
  const byId = (id: string) => map.lessons.find((one) => one.id === id) as MapLesson
  const l1 = byId('tr1.l1')
  const l6 = byId('tr1.l6')
  const guess = (lesson: MapLesson, day: number) => made('predict', lesson.predicts[0] ?? '', { day })

  test('answers given in lesson 1 count for lesson 1 and never start or pass a later lesson that asks the same family', () => {
    const events = [guess(l1, 0), ...passes('tr1.which-mechanism', 0)]
    const stand = standings(events, index, { route: l1.route, at: isoAt(0) })
    expect(stand.get('tr1.l1')?.state).toBe('done')
    for (const id of ['tr1.l3', 'tr1.l5', 'tr1.l6', 'tr1.l7']) expect(stand.get(id)?.state, id).toBe('not-started')
  })

  test('answers given after a guess in lesson 6 go to lesson 6', () => {
    const events = [guess(l1, 0), ...passes('tr1.which-mechanism', 0), guess(l6, 1), ...passes('tr1.where-does-it-run', 1), ...passes('tr1.which-mechanism', 1)]
    const stand = standings(events, index, null)
    expect(stand.get('tr1.l6')?.state).toBe('done')
    expect(stand.get('tr1.l3')?.state).toBe('not-started')
  })

  test('answers after the last guess or run go to the bookmark lesson when it asks the family, else to the first lesson that asks it', () => {
    const events = [guess(l1, 0), ...passes('tr1.where-does-it-run', 1), ...passes('tr1.which-mechanism', 1)]
    expect(standings(events, index, { route: l6.route, at: isoAt(2) }).get('tr1.l6')?.state).toBe('done')
    const away = standings(events, index, null)
    expect(away.get('tr1.l6')?.state).toBe('not-started')
    expect(away.get('tr1.l3')?.state).toBe('done')
  })
})

describe('when a Test is passed', () => {
  const index = indexLessons(COURSE)
  const stateOf = (events: LedgerEvent[], id: string) => standings(events, index).get(id)

  test('the last count attempts at each family right at full weight pass it; an earlier miss does not hold it back', () => {
    expect(stateOf(passes('tr1.q2'), 'tr1.l2')?.test).toBe('passed')
    const recovered = [made('item', 'item:gen/tr1.q2/v1', { ok: false, day: 0 }), ...passes('tr1.q2', 1)]
    expect(stateOf(recovered, 'tr1.l2')?.state).toBe('done')
  })

  test('a miss among the last count, or too few attempts, is tried and not passed', () => {
    const missed = [...passes('tr1.q2', 0), made('item', 'item:gen/tr1.q2/v1', { ok: false, day: 1 })]
    expect(stateOf(missed, 'tr1.l2')).toMatchObject({ test: 'tried', state: 'started' })
    expect(stateOf(passes('tr1.q2').slice(0, 2), 'tr1.l2')?.test).toBe('tried')
  })

  test('a right answer at part weight (assisted or practice) does not count toward the pass', () => {
    const assisted = [1, 2, 3].map(() => made('item', 'item:gen/tr1.q2/v1', { provenance: 'assisted' }))
    expect(stateOf(assisted, 'tr1.l2')?.test).toBe('tried')
  })

  test('each graded ref needs a passing graded run, and a practice pass does not pass it', () => {
    const questions = passes('tr2.q6')
    expect(stateOf([...questions, play('play:loop/close', { provenance: 'practice', rev: L6.rev })], 'tr2.l6')?.test).not.toBe('passed')
    expect(stateOf([...questions, play('play:loop/close', { provenance: 'unseen', ok: false, rev: L6.rev })], 'tr2.l6')?.test).toBe('tried')
    expect(stateOf([...questions, play('play:loop/close', { provenance: 'unseen', rev: L6.rev })], 'tr2.l6')?.state).toBe('done')
  })

  test('a practice run of a graded ref is not an attempt at the Test: the answer stays on Read', () => {
    const events = [play('play:loop/close', { provenance: 'practice', rev: L6.rev })]
    expect(stateOf(events, 'tr2.l6')?.test).toBe('none')
    expect(nextStep(events, COURSE, null)).toMatchObject({ lesson: 'tr2.l6', place: 'read' })
  })
})

describe('lastTime', () => {
  const names = (game: string, level: string) => (game === 'loop' && level === 'graphs' ? 'Step loop, CUDA graphs' : undefined)

  test('tells the last day of work in the lesson last worked on as one sentence, with the attempts in words', () => {
    const events = [
      made('predict', 'predict:tr1.l2#tr1.l2.p1', { day: 0 }),
      play('play:loop/graphs', { rev: L5.rev, day: 2 }),
      made('item', 'item:gen/tr2.q5/v1', { ok: false, day: 2 }),
      made('item', 'item:gen/tr2.q5/v1', { day: 2 }),
      made('item', 'item:gen/tr2.q5/v1', { day: 2 }),
    ]
    expect(lastTime(events, COURSE, names)).toBe('Last time: you ran Step loop, CUDA graphs (passed in practice) and tried 3 questions in TR2 lesson 1.')
  })

  test('a question set that two lessons list belongs to the lesson the learner was reading, as for the way on, and not to the earliest that is open (R-T47)', () => {
    const shared = { family: 'x.shared', count: 3 }
    const first = lesson('tr1.l1', 'l1-first', { test: { questions: [shared, { family: 'x.own', count: 3 }], graded: [] }, rev: REV(31) })
    const second = lesson('tr1.l2', 'l2-second', { test: { questions: [shared], graded: [] }, rev: REV(32) })
    const course = [first, second]
    const events = passes('x.shared', 1)
    // No place held: the set goes to the earliest lesson that is not done, as before.
    expect(lastTime(events, course)).toBe('Last time: you passed 3 questions in TR1 lesson 1.')
    // The learner was reading lesson 2 (it is done, and the first is not): the sentence names the lesson they were in.
    const mark: Bookmark = { route: second.route, section: 'test', at: isoAt(2) }
    expect(lastTime(events, course, undefined, mark)).toBe('Last time: you passed 3 questions in TR1 lesson 2.')
    // A place that is not a lesson of the course changes nothing.
    expect(lastTime(events, course, undefined, { route: '/m/tr9/l1', at: isoAt(2) })).toBe('Last time: you passed 3 questions in TR1 lesson 1.')
  })

  test('says nothing with no lesson event, and never prints a ref or an id for a level it cannot name', () => {
    expect(lastTime([], COURSE)).toBeNull()
    expect(lastTime([made('review', 'review:tr2.bubble')], COURSE)).toBeNull()
    const sentence = lastTime([play('play:engine-floor/nano', { ok: false, provenance: 'unseen' })], COURSE) ?? ''
    expect(sentence).toBe('Last time: you ran a level (not yet) in TR1 lesson 1.')
    expect(sentence).not.toMatch(/engine-floor|nano|tr1\.l1/)
  })

  test('an attempt reads not yet, passed in practice or passed: a pass at part weight is a pass in practice', () => {
    expect(attemptWord(made('item', 'item:gen/tr1.q1/v1', { ok: false }))).toBe('not yet')
    expect(attemptWord(made('item', 'item:gen/tr1.q1/v1', { provenance: 'assisted' }))).toBe('passed in practice')
    expect(attemptWord(play('play:loop/graphs', { provenance: 'practice' }))).toBe('passed in practice')
    expect(attemptWord(play('play:loop/close', { provenance: 'unseen' }))).toBe('passed')
  })
})

describe('on the compiled map', () => {
  const map = JSON.parse(repoOutput('src/content/generated/map.json')) as CourseMap

  test('an empty ledger gives the first section of TR1 lesson 1', () => {
    const step = nextStep([], map.lessons, null)
    expect(step).toMatchObject({ lesson: 'tr1.l1', label: 'Start: TR1 lesson 1', href: '/m/tr1/l1-five-mechanisms' })
  })

  test("the header's pointer before any page has written one is that same answer", () => {
    const step = nextStep([], map.lessons, null)
    expect(START_POINTER).toEqual({ href: step.href, label: step.label, word: step.word, minutes: step.minutes as number })
  })

  test('every lesson can be done: its Test passes on full-weight answers and graded runs, and the answer then moves on', () => {
    for (const [at, one] of map.lessons.entries()) {
      const events = [
        ...one.test.questions.flatMap((row) => Array.from({ length: row.count }, () => made('item', `item:gen/${row.family}/v1`))),
        ...one.test.graded.map((ref) => ({ ...play(ref, { provenance: 'unseen' }), rev: one.rev }) as LedgerEvent),
      ]
      // The answers were given in this lesson: the bookmark is in it (a question set several lessons ask goes to the lesson it was answered in).
      const stand = standings(events, indexLessons(map.lessons), { route: one.route, at: isoAt(1) })
      expect(stand.get(one.id)?.state, one.id).toBe('done')
      // Worked on last (the bookmark is in it, after its events), a done lesson hands on to the next one after it that is not done.
      const next = map.lessons.slice(at + 1).find((candidate) => stand.get(candidate.id)?.state !== 'done') ?? map.lessons.find((candidate) => stand.get(candidate.id)?.state !== 'done')
      expect(nextStep(events, map.lessons, { route: one.route, at: isoAt(1) }).lesson, one.id).toBe(next?.id ?? null)
    }
  })
})
