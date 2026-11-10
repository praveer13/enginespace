/*
 * The ids of TRACKER.md's tasks, and the readers that take them (W1b-report §10, the close-out round).
 *
 * Until the close-out, three places read an id as `W\d-T\d\d`, which is not a W1b id: the tracker reader of these tests (support.ts), the
 * marker guard and the reserved-step check of workflows.test.ts, and verify:kc's check of `planned`. A task of W1b could be marked `[=]`
 * without being on the list of merged tasks, or be named by a reserved step after it had merged, and nothing said so.
 *
 *   - TASK_ID reads the id of a task of every wave that the tracker has, W1b's among them, and refuses what is not an id.
 *   - Every heading of TRACKER.md that opens as a task does has an id that TASK_ID reads, and each is found once. A wave named in a shape
 *     that the pattern cannot read, W1c-T01 or W1b-T8, fails here and is not left out in silence.
 *   - The pattern of before is shown to read none of W1b's headings, so these checks can fail.
 *
 * tests/ci/workflows.test.ts holds the marker guard and the reserved-step check to W1b's ids, and tests/kc/verify-kc.test.ts holds
 * verify:kc's reader to the same set.
 */
import { describe, expect, test } from 'bun:test'
import { markedTasks, read, TASK_ID, taskHeadings, tasksIn, trackerTasks, unreadTaskIds } from './support'

const tracker = read('docs/TRACKER.md')
/** The pattern of before the close-out: a digit for the wave, and nothing after it. */
const BEFORE = /^#### \[(.)\] (W\d-T\d\d) · /gm

describe('TASK_ID', () => {
  const whole = new RegExp(`^${TASK_ID}$`)

  test('reads the id of a task of each wave, and of W1b', () => {
    for (const id of ['W0-T01', 'W1-T38', 'W1b-T01', 'W1b-T16', 'W2-T44', 'W3-T17']) expect([id, whole.test(id)]).toEqual([id, true])
  })

  test('reads the carry-over of another wave in the same shape, so that a later W2b needs no change', () => {
    expect(whole.test('W2b-T01')).toBe(true)
  })

  test('refuses what is not an id: a task number of one digit or of three, a wave with another letter, lower case, and a part alone', () => {
    for (const id of ['W1-T1', 'W1b-T8', 'W1b-T100', 'W1c-T01', 'W1bb-T01', 'w1b-T01', 'W1B-T01', 'W1b-t01', 'W-T01', 'W1b', 'T01', 'W1b-T01 · x'])
      expect([id, whole.test(id)]).toEqual([id, false])
  })
})

describe('the headings of TRACKER.md', () => {
  const headings = taskHeadings(tracker)

  test('every one that opens as a task does has an id that TASK_ID reads', () => {
    expect(unreadTaskIds(tracker)).toEqual([])
    // The tracker's tasks are many (W0, W1, W1b, W2 and W3), and the headings that the loose pattern finds are the ones that the strict one does.
    const loose = [...tracker.matchAll(/^#### \[.\] (\S+) · /gm)].map((match) => match[1])
    expect(loose.length).toBeGreaterThan(100)
    expect(headings.map(({ id }) => id)).toEqual(loose)
  })

  test('are found once each by every reader that the tests have: an id is on one heading only', () => {
    const ids = headings.map(({ id }) => id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...trackerTasks().keys()]).toEqual(ids)
  })

  test('hold the sixteen tasks of W1b, which the pattern of before did not read', () => {
    const w1b = headings.map(({ id }) => id).filter((id) => id.startsWith('W1b-'))
    expect(w1b.slice(0, 16)).toEqual(Array.from({ length: 16 }, (_, at) => `W1b-T${String(at + 1).padStart(2, '0')}`))
    const before = [...tracker.matchAll(BEFORE)].map((match) => match[2])
    expect(before.filter((id) => id.startsWith('W1b'))).toEqual([])
    expect(before.length).toBeLessThan(headings.length)
  })

  test('mark W1b done or in review, as the exit review set it, so that the marker guard has tasks of W1b to look for', () => {
    expect(markedTasks(tracker, 'x=').filter((id) => id.startsWith('W1b-')).length).toBeGreaterThanOrEqual(16)
  })
})

describe('what the readers do with a tracker', () => {
  const text = [
    '## W1b: carry-over',
    '',
    '#### [=] W1b-T05 · TR5a item families · M · sonnet · deps: —',
    '- **Goal:** the families.',
    '',
    '#### [ ] W2-T01 · Schemas · M · sonnet · deps: —',
    '',
    '### Closing',
    '',
    '#### [x] W0-T25 · Finish review · M · opus · deps: —',
    '',
    'W1b-T99 is only mentioned in a line.',
    '',
  ].join('\n')

  test('read the markers and the ids in the order of the page, and a task that is only mentioned is no task', () => {
    expect(taskHeadings(text)).toEqual([
      { marker: '=', id: 'W1b-T05' },
      { marker: ' ', id: 'W2-T01' },
      { marker: 'x', id: 'W0-T25' },
    ])
    expect(markedTasks(text, 'x=')).toEqual(['W1b-T05', 'W0-T25'])
    expect(markedTasks(text, '=')).toEqual(['W1b-T05'])
  })

  test("keep a task's text from its heading to the next heading of any level", () => {
    const tasks = tasksIn(text)
    expect([...tasks.keys()]).toEqual(['W1b-T05', 'W2-T01', 'W0-T25'])
    expect(tasks.get('W1b-T05')).toBe('#### [=] W1b-T05 · TR5a item families · M · sonnet · deps: —\n- **Goal:** the families.\n\n')
    expect(tasks.get('W2-T01')?.endsWith('\n\n')).toBe(true)
  })

  test('would find a heading whose id the pattern does not read, so that no task is left out in silence', () => {
    const odd = [
      '#### [=] W1b-T05 · An id the pattern reads · S',
      '#### [ ] W1c-T01 · A wave with another letter · S',
      '#### [x] W1b-T8 · One digit · S',
      '#### [=] W1b-T100 · Three digits · S',
      '',
    ].join('\n')
    expect(taskHeadings(odd).map(({ id }) => id)).toEqual(['W1b-T05'])
    expect(unreadTaskIds(odd)).toEqual(['W1c-T01', 'W1b-T8', 'W1b-T100'])
    expect(unreadTaskIds(text)).toEqual([])
  })
})
