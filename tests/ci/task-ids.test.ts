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
import { between, markedTasks, read, TASK_ID, taskHeadings, tasksIn, trackerTasks, unreadTaskIds } from './support'

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

  test('reads the tasks of wave R, the redesign, whose wave is the letter R alone (D-068)', () => {
    for (const id of ['R-T01', 'R-T20', 'R-T50']) expect([id, whole.test(id)]).toEqual([id, true])
    for (const id of ['R-T1', 'R-T1000', 'Rb-T01', 'R1-T01', 'r-T01', 'WR-T01']) expect([id, whole.test(id)]).toEqual([id, false])
  })

  test('reads a task number of two or three digits, as the second build plan numbers its tasks past 99', () => {
    for (const id of ['W2b-T99', 'W2b-T100', 'W2b-T105', 'W2b-T209', 'R-T100']) expect([id, whole.test(id)]).toEqual([id, true])
  })

  test('refuses what is not an id: a task number of one digit or of four, a wave with another letter, lower case, and a part alone', () => {
    for (const id of ['W1-T1', 'W1b-T8', 'W2b-T1050', 'W1c-T01', 'W1bb-T01', 'w1b-T01', 'W1B-T01', 'W1b-t01', 'W-T01', 'W1b', 'T01', 'W1b-T01 · x'])
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

  test('hold the fifty tasks of wave R in order, each with the size, model and deps of docs/waves/wr-tasks.json', () => {
    const plan = JSON.parse(read('docs/waves/wr-tasks.json')) as { id: string; title: string; size: string; model: string; deps: string[] }[]
    expect(plan.length).toBe(50)
    expect(headings.map(({ id }) => id).filter((id) => id.startsWith('R-'))).toEqual(plan.map((task) => task.id))
    const lines = [...tracker.matchAll(/^#### \[.\] (R-T\d\d · .*)$/gm)].map((match) => match[1])
    expect(lines).toEqual(plan.map((task) => `${task.id} · ${task.title} · ${task.size} · ${task.model} · deps: ${task.deps.length > 0 ? task.deps.join(', ') : '—'}`))
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
      '#### [=] W1b-T1000 · Four digits · S',
      '',
    ].join('\n')
    expect(taskHeadings(odd).map(({ id }) => id)).toEqual(['W1b-T05'])
    expect(unreadTaskIds(odd)).toEqual(['W1c-T01', 'W1b-T8', 'W1b-T1000'])
    expect(unreadTaskIds(text)).toEqual([])
  })
})

describe('the markers of W2, which are set to the tree (W2b-T01)', () => {
  /** The lines of a W2 task that hold its checks: the Accept and Open check fields, to the next field of the task. */
  const checksOf = (text: string): string => {
    const kept: string[] = []
    let inside = false
    for (const line of text.split('\n')) {
      if (/^- \*\*(Accept|Open check)/.test(line)) inside = true
      else if (/^- \*\*/.test(line) || /^#{2,4} /.test(line)) inside = false
      if (inside) kept.push(line)
    }
    return kept.join('\n')
  }
  /** The done tasks of W2 whose checks name the owner, a GPU or W2-T12: none may be done. */
  const wrongDone = (section: string): string[] =>
    [...tasksIn(section)]
      .filter(([id, text]) => id.startsWith('W2-') && /^#### \[x\]/.test(text))
      .filter(([, text]) => /owner|GPU|W2-T12/.test(checksOf(text)))
      .map(([id]) => id)

  test('no task of W2 is done while a check of it names the owner, a GPU or W2-T12', () => {
    const w2 = between(tracker, '\n## W2: ', '\n## W2b: ')
    expect(markedTasks(w2, 'x').length).toBeGreaterThan(5)
    expect(wrongDone(w2)).toEqual([])
  })

  test('would find one: a done task whose check names the owner, a GPU or W2-T12, and not one whose Goal does', () => {
    const text = [
      '#### [x] W2-T90 · Needs the owner · S · sonnet · deps: —',
      '- **Goal:** the owner reads it.',
      '- **Accept:**',
      "  1. The Dockerfile builds are left to the owner's smoke run (W2-T12).",
      '',
      '#### [x] W2-T91 · Needs a GPU · S · sonnet · deps: —',
      '- **Accept:** `selftest --gpu` passes on a GPU.',
      '',
      '#### [x] W2-T92 · Holds · S · sonnet · deps: —',
      '- **Goal:** runs on a GPU, owner or not.',
      '- **Accept:** the unit tests pass on a CPU.',
      '',
      '#### [~] W2-T93 · Open · S · sonnet · deps: —',
      '- **Accept:** waits for W2-T12.',
      '',
    ].join('\n')
    expect(wrongDone(text)).toEqual(['W2-T90', 'W2-T91'])
  })

  test('hold a State line on each task that is built and not done: W2-T04, T08, T11 and T19', () => {
    const tasks = trackerTasks()
    for (const id of ['W2-T04', 'W2-T08', 'W2-T11', 'W2-T19']) {
      const text = tasks.get(id) ?? ''
      expect([id, text.startsWith('#### [~] ')]).toEqual([id, true])
      expect([id, /\n- \*\*State \(2026-11-(?:19|22)\):\*\* built; open check: .+, closes with W2b?-T\d{2,3}/.test(text)]).toEqual([id, true])
    }
  })

  test('has a heading for each task of wave 1 (W2b-T01 to T37 and T39 to T53), and any other heading of W2b is a later task, T54 or after', () => {
    const w2b = taskHeadings(tracker).map(({ id }) => id).filter((id) => id.startsWith('W2b-'))
    const want = [...Array.from({ length: 37 }, (_, at) => at + 1), ...Array.from({ length: 15 }, (_, at) => at + 39)].map((n) => `W2b-T${String(n).padStart(2, '0')}`)
    expect(want.filter((id) => !w2b.includes(id))).toEqual([])
    expect(w2b.filter((id) => !want.includes(id) && Number(id.slice(5)) < 54)).toEqual([])
  })
})
