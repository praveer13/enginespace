/*
 * R-T12: the openers of REDESIGN §2.5, one row for each of the 27 built lessons (tests/content/openers-table.ts). The lesson's opener is
 * read from the file's shape (`groupSections`), and the map's lessons table says the same; each row is held to its letter, the levels it opens
 * on, its word limit (A at most 60, B 61 to 200) and its graded levels.
 *
 * A lesson that a content task has not yet edited is marked `waiting` on that task in the table, and its test is written to fail while the
 * lesson differs from its row (`test.failing`). When the task makes the lesson match, the test starts to fail, and the task removes the mark.
 * A lesson that already matches has no mark.
 */
import { describe, expect, test } from 'bun:test'
import { compiledLessonSchema, courseMapSchema } from '@es/schema'
import type { CompiledLesson } from '@es/schema'
import { groupSections, SETUP_WORDS } from '@/content/render/sections'
import { compileContent } from '../../scripts/content/build.ts'
import { PACING } from '../../scripts/content/pacing.ts'
import { OPENERS } from './openers-table.ts'
import { failing, repo } from './support.ts'

const compiled = compileContent({ root: repo })
const lessons = new Map<string, CompiledLesson>(
  compiled.outputs
    .filter((output) => output.path.startsWith('src/content/generated/lessons/'))
    .map((output) => compiledLessonSchema.parse(JSON.parse(output.text)))
    .map((lesson) => [lesson.id, lesson]),
)
const map = courseMapSchema.parse(JSON.parse(compiled.outputs.find((output) => output.path === 'src/content/generated/map.json')?.text ?? '{}'))
const WORD = { run: 'A', primer: 'B', read: 'C' } as const

/** What the lesson is, held against its row. Throws on the first difference. */
function holdsRow(id: string): void {
  const row = OPENERS.find((one) => one.lesson === id)
  const lesson = lessons.get(id)
  const mapped = map.lessons.find((one) => one.id === id)
  if (row === undefined || lesson === undefined || mapped === undefined) throw new Error(`${id} is not built`)
  const sections = groupSections(lesson.blocks)
  expect({ lesson: id, opener: sections.opener }).toEqual({ lesson: id, opener: row.opener })
  expect({ lesson: id, opener: WORD[mapped.opener] }).toEqual({ lesson: id, opener: row.opener })
  if (row.opener === 'A') expect(sections.setupWords).toBeLessThanOrEqual(SETUP_WORDS)
  if (row.opener === 'B') {
    expect(sections.setupWords).toBeGreaterThan(SETUP_WORDS)
    expect(sections.setupWords).toBeLessThanOrEqual(PACING.beforeOpener)
  }
  if (row.first !== null) {
    const opening = row.opener === 'C' ? mapped.inline : mapped.run
    if (row.opener === 'C') expect(mapped.run).toEqual([])
    expect(opening.slice(0, row.first.length)).toEqual([...row.first])
    if (row.first.length === 0) expect(mapped.inline).toEqual([])
  }
  expect(mapped.test.graded).toEqual([...row.graded])
}

describe('the openers table of REDESIGN §2.5', () => {
  test('has the 27 rows: 4 A, 13 B and 10 C, and every built lesson is one of them', () => {
    expect(OPENERS.length).toBe(27)
    expect(OPENERS.filter((row) => row.opener === 'A').length).toBe(4)
    expect(OPENERS.filter((row) => row.opener === 'B').length).toBe(13)
    expect(OPENERS.filter((row) => row.opener === 'C').length).toBe(10)
    expect([...lessons.keys()].sort()).toEqual(OPENERS.map((row) => row.lesson).sort())
  })

  test('a mark names a task of the content wave, and a lesson is waiting on the task that edits it', () => {
    const marks = OPENERS.flatMap((row) => (row.waiting === undefined ? [] : [row.waiting]))
    expect(marks.filter((task) => !/^R-T3[4-9]$/.test(task))).toEqual([])
    const byModule: Record<string, string[]> = { tr1: ['R-T34', 'R-T35'], tr2: ['R-T36'], tr5a: ['R-T37'], tr6: ['R-T38'], tr8: ['R-T39'] }
    for (const row of OPENERS) {
      if (row.waiting !== undefined) expect(byModule[row.lesson.split('.')[0]]).toContain(row.waiting)
    }
  })

  for (const row of OPENERS) {
    if (row.waiting === undefined) test(`${row.lesson} is ${row.opener}${row.first === null ? '' : ` on ${row.first.join(', ') || 'no level before its Test'}`}`, () => holdsRow(row.lesson))
    else failing(`${row.lesson} is ${row.opener}: waiting on ${row.waiting}, which removes this mark`, () => holdsRow(row.lesson))
  }
})
