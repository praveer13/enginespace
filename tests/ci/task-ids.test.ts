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
import { between, markedTasks, read, TASK_ID, tableRows, taskHeadings, tasksIn, trackerTasks, unreadTaskIds } from './support'

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
    // W2b-T38 is the one id below 54 that wave 1 left out and wave 2 took (W2b-T180): its heading is in wave 2's section.
    expect(w2b.filter((id) => !want.includes(id) && Number(id.slice(5)) < 54 && id !== 'W2b-T38')).toEqual([])
  })
})

/*
 * Wave 2's section of TRACKER.md and the records beside it (W2b-T180). The ids below are the tasks of the wave's plan, in the order of its
 * task list. W2-T20 and W2-T24 (tasks of 2a) and W2-T29, W2-T30 and W2-T33 (tasks of 2b) keep their headings in the W2 section, edited
 * there; the section of wave 2 holds the rest, and W2b-T210, which is added from the reserve if W2b-T96's record says yes.
 */
const HALF_2A = [
  'W2b-T69', 'W2b-T180', 'W2b-T70', 'W2b-T71', 'W2b-T72', 'W2b-T74', 'W2b-T78', 'W2b-T179',
  'W2b-T88', 'W2b-T89', 'W2b-T191', 'W2b-T73', 'W2b-T79', 'W2b-T80', 'W2b-T90', 'W2b-T91',
  'W2b-T192', 'W2b-T85', 'W2b-T86', 'W2b-T92', 'W2b-T93', 'W2b-T193', 'W2b-T77', 'W2b-T84',
  'W2b-T81', 'W2b-T82', 'W2b-T83', 'W2b-T94', 'W2b-T95', 'W2b-T194', 'W2b-T75', 'W2b-T190',
  'W2b-T76', 'W2b-T87', 'W2b-T129', 'W2b-T130', 'W2b-T131', 'W2b-T132', 'W2b-T133', 'W2b-T181',
  'W2b-T134', 'W2b-T199', 'W2b-T38', 'W2b-T96', 'W2b-T97', 'W2b-T98', 'W2b-T99', 'W2b-T100',
  'W2b-T101', 'W2b-T102', 'W2b-T103', 'W2b-T104', 'W2b-T195', 'W2b-T105', 'W2b-T106', 'W2b-T107',
  'W2b-T108', 'W2b-T109', 'W2b-T196', 'W2b-T110', 'W2b-T111', 'W2b-T182', 'W2b-T183', 'W2b-T197',
  'W2b-T112', 'W2b-T113', 'W2b-T114', 'W2b-T115', 'W2b-T116', 'W2b-T117', 'W2b-T198', 'W2b-T120',
  'W2b-T184', 'W2b-T121', 'W2b-T122', 'W2b-T123', 'W2b-T200', 'W2b-T124', 'W2b-T201', 'W2b-T125',
]

const HALF_2B = [
  'W2b-T126', 'W2b-T118', 'W2b-T119', 'W2b-T136', 'W2b-T137', 'W2b-T138', 'W2b-T139', 'W2b-T140',
  'W2b-T141', 'W2b-T142', 'W2b-T202', 'W2b-T143', 'W2b-T144', 'W2b-T145', 'W2b-T146', 'W2b-T147',
  'W2b-T203', 'W2b-T148', 'W2b-T185', 'W2b-T186', 'W2b-T204', 'W2b-T149', 'W2b-T150', 'W2b-T151',
  'W2b-T152', 'W2b-T153', 'W2b-T154', 'W2b-T155', 'W2b-T205', 'W2b-T156', 'W2b-T157', 'W2b-T158',
  'W2b-T159', 'W2b-T206', 'W2b-T170', 'W2b-T171', 'W2b-T172', 'W2b-T135', 'W2b-T187', 'W2b-T188',
  'W2b-T207', 'W2b-T173', 'W2b-T189', 'W2b-T174', 'W2b-T175', 'W2b-T176', 'W2b-T208', 'W2b-T177',
  'W2b-T209', 'W2b-T178',
]

describe("wave 2's section of the tracker (W2b-T180)", () => {
  const section = between(tracker, '\n## Wave 2 of the second build plan: 2a and 2b', '\n## WR: ')
  const inSection = taskHeadings(section)
  const tasks = tasksIn(section)

  test('has one heading for each task of the plan that the W2 section does not hold, in order, and W2b-T210 last', () => {
    expect(inSection.map(({ id }) => id)).toEqual([...HALF_2A, ...HALF_2B, 'W2b-T210'])
  })

  test('has no marker: every task of wave 2 is `[ ]` until the exit reports move them (W2b-T125, W2b-T178)', () => {
    expect(inSection.filter(({ marker }) => marker !== ' ')).toEqual([])
    const all = new Map(taskHeadings(tracker).map(({ id, marker }) => [id, marker]))
    for (const id of ['W2-T20', 'W2-T24', 'W2-T29', 'W2-T30', 'W2-T33']) expect([id, all.get(id)]).toEqual([id, ' '])
  })

  test('uses none of the ids that the plan leaves out: W2b-T127, W2b-T128 and W2b-T160 to W2b-T169', () => {
    const unused = ['W2b-T127', 'W2b-T128', ...Array.from({ length: 10 }, (_, at) => `W2b-T${160 + at}`)]
    const ids = new Set(taskHeadings(tracker).map(({ id }) => id))
    expect(unused.filter((id) => ids.has(id))).toEqual([])
    expect(section).toContain('W2b-T127, W2b-T128 and W2b-T160 to W2b-T169 are not used')
  })

  test('gives each task of 2a a Goal, a Files line and an Accept, and a Read line unless it reads nothing', () => {
    for (const id of HALF_2A) {
      const text = tasks.get(id) ?? ''
      expect([id, /\n- \*\*Goal:\*\* /.test(text), /\n- \*\*Files:\*\* /.test(text), /\n- \*\*Accept:\*\*\n {2}1\. /.test(text)]).toEqual([id, true, true, true])
    }
  })

  test('gives each task of 2b one line that says its body is written by W2b-T126, and W2b-T126 its own body', () => {
    for (const id of HALF_2B.filter((task) => task !== 'W2b-T126')) {
      const lines = (tasks.get(id) ?? '').trim().split('\n')
      expect([id, lines.length, lines[1]?.startsWith('- Body written by W2b-T126.')]).toEqual([id, 2, true])
    }
    expect(tasks.get('W2b-T126')).toContain('- **Goal:** ')
  })

  test("W2b-T38's heading says it earns no KC, so a `planned:` line cannot name it; W2b-T210 is run only if W2b-T96's record says yes", () => {
    expect(tasks.get('W2b-T38')?.split('\n', 1)[0]).toContain('earns no KC')
    expect(tasks.get('W2b-T210')?.split('\n', 1)[0]).toContain('TR3: one real profiler trace from the locked CPU environment')
    expect(tasks.get('W2b-T210')).toContain("Run only if W2b-T96's record says yes")
  })

  test('does not hold what a learner of the site would be told by a build: no path outside the repository, and no sentence that the owner chose something', () => {
    expect(section).not.toMatch(new RegExp(['', 'home', ''].join('/') + '|' + ['', 'tmp', ''].join('/') + '|claude-\\d'))
    // The accept lines that forbid such a sentence name it, and are not it.
    const claims = section.split('\n').filter((line) => !/^\s*\d+\. (No sentence says|Nothing says)/.test(line))
    expect(claims.filter((line) => /the owner (chose|approved|saw|decided)\b/i.test(line))).toEqual([])
  })

  test("W2-T24 no longer depends on W2-T23, and W2-T33 no longer on W2-T31 or W2-T32, with the reason said where the dependency was", () => {
    const deps = (id: string) => (trackerTasks().get(id) ?? '').split('\n', 1)[0].split('deps: ')[1]
    expect(deps('W2-T24')).toBe('W2b-T183')
    expect(deps('W2-T33')).toBe('W2b-T149')
    expect(trackerTasks().get('W2-T24')).toContain('no longer depends on W2-T23')
    expect(trackerTasks().get('W2-T33')).toContain('no longer depends on W2-T31 or W2-T32')
  })

  test("W2-T20's and W2-T30's splits are said in their headings' bodies, each naming the tasks that took the parts", () => {
    const t20 = trackerTasks().get('W2-T20') ?? ''
    for (const id of ['W2b-T98', 'W2b-T99', 'W2b-T100', 'W2b-T101', 'W2b-T102']) expect([id, t20.includes(id)]).toEqual([id, true])
    const t30 = trackerTasks().get('W2-T30') ?? ''
    for (const id of ['W2b-T136', 'W2b-T137', 'W2b-T138', 'W2b-T139', 'W2b-T140']) expect([id, t30.includes(id)]).toEqual([id, true])
  })

  test('every dependency a heading of the section names is a heading of the tracker', () => {
    const ids = new Set(taskHeadings(tracker).map(({ id }) => id))
    const missing = inSection.flatMap(({ id }) => {
      const line = (tasks.get(id) ?? '').split('\n', 1)[0]
      const deps = line.split('deps: ')[1]?.split(', ').filter((dep) => dep !== '—') ?? []
      return deps.filter((dep) => !ids.has(dep)).map((dep) => `${id} -> ${dep}`)
    })
    expect(missing).toEqual([])
  })
})

describe('the decision numbers that wave 2 reserves (W2b-T180)', () => {
  const rows = tableRows(between(tracker, '**Decision numbers.**', '\nD-077 to D-')).map((cells) => ({ number: cells[0], task: cells[1] }))
  const LANES = ['2a:Gate', '2a:D2', '2a:D1', '2a:D3', '2a:D4', '2a:G', '2a:D5', '2a:D6', '2a:TR3', '2a:Exit', '2b:Open', '2b:TR5b', '2b:G', '2b:TR7', '2b:Cards', '2b:Exit']

  test('start at D-077, run on without a gap or a repeat, and name W2b-T70, T71, T96 and T118', () => {
    expect(rows.map(({ number }) => number)).toEqual(rows.map((_, at) => `D-${String(77 + at).padStart(3, '0')}`))
    for (const id of ['W2b-T70', 'W2b-T71', 'W2b-T96', 'W2b-T118']) expect([id, rows.some(({ task }) => task === id)]).toEqual([id, true])
  })

  test('keep two spare numbers for each lane', () => {
    for (const lane of LANES) expect([lane, rows.filter(({ task }) => task === `spare, lane ${lane}`).length]).toEqual([lane, 2])
  })

  // A record that a reserved number's own task has written (its status names that task) is the reservation used, not a clash.
  const decisions = read('docs/DECISIONS.md')
  const records = [...decisions.matchAll(/^### D-(\d{3}) · [^\n]*\n+- \*\*Status:\*\* ([^\n]*)/gm)].map((match) => ({ number: Number(match[1]), status: match[2] }))
  const reservedFor = new Map(rows.map(({ number, task }) => [Number(number.slice(2)), task]))
  const usesItsReservation = ({ number, status }: { number: number; status: string }) => {
    const task = reservedFor.get(number)
    return task !== undefined && !task.startsWith('spare') && status.includes(`(${task},`)
  }

  test('are above the highest record that docs/DECISIONS.md has written', () => {
    const written = records.filter((record) => !usesItsReservation(record)).map(({ number }) => number)
    expect(Math.max(...written)).toBeLessThan(77)
  })

  test('are each written only by the task the table reserves it for', () => {
    const atOrAbove = records.filter(({ number }) => reservedFor.has(number))
    for (const record of atOrAbove) expect([record.number, usesItsReservation(record)]).toEqual([record.number, true])
    expect(records.length).toBe([...decisions.matchAll(/^### D-\d{3} · /gm)].length)
  })
})

describe('the open questions of wave 2, recorded in docs/DECISIONS.md (W2b-T180)', () => {
  const decisions = read('docs/DECISIONS.md')
  const rows = tableRows(between(decisions, '### Open questions of wave 2', '\n**Answered.** O-1'))

  test('are N2 first, then N9 to N19 in order, each with a question, a default and the tasks that need it', () => {
    expect(rows.map((cells) => cells[0])).toEqual(['N2', ...Array.from({ length: 11 }, (_, at) => `N${9 + at}`)])
    for (const cells of rows) expect([cells[0], cells.length, cells.slice(1).every((cell) => cell.length > 0)]).toEqual([cells[0], 4, true])
  })

  test('say that the owner has answered none of them, and give the three answers that D-070 to D-072 hold', () => {
    const text = between(decisions, '### Open questions of wave 2', '| # | Question')
    expect(text).toContain('The owner has answered none of them')
    expect(text).toContain('D-070 to D-072')
  })
})
