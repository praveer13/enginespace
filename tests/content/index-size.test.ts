/**
 * The course index is in the front page's first paint (A§4.6), so it must not grow with the number of lessons. The lesson rows are in a
 * second generated file that a page loads when it lists lessons (D-059). A fixture course of 60 lessons and one of 6 compile to the same
 * index.json, byte for byte, and differ only in the lesson index.
 */
import { describe, expect, test } from 'bun:test'
import { contentIndexSchema, lessonIndexSchema } from '@es/schema'
import { compileContent } from '../../scripts/content/build.ts'
import { LESSON, output, project, read, readSample } from './support.ts'

/** The sample course with `count` lessons: the sample lesson, and copies of it with their own ids and file names. */
function course(count: number) {
  const source = readSample(LESSON)
  const edits: Record<string, string> = {}
  for (let n = 1; n < count; n += 1) {
    edits[`content/modules/tr2/lessons/l${n}-sample.md`] = source.replaceAll('tr2.l0', `tr2.l${n}`).replace('title: A sample lesson that uses every block', 'title: Another sample lesson')
  }
  return compileContent({ root: project(edits) })
}

describe('the course index and the lesson index', () => {
  const small = course(6)
  const large = course(60)
  const file = (result: typeof small, name: string) => output(result, `src/content/generated/${name}.json`)

  test('both fixture courses compile with no error', () => {
    expect(small.diagnostics.filter((one) => one.severity === 'error')).toEqual([])
    expect(large.diagnostics.filter((one) => one.severity === 'error')).toEqual([])
  })

  test('index.json of 60 lessons and of 6 is the same bytes, and names the first lesson and the modules only', () => {
    expect(file(large, 'index')).toBe(file(small, 'index'))
    const index = contentIndexSchema.parse(JSON.parse(file(small, 'index')))
    expect(index.firstLesson?.route).toBe('/m/tr2/l0-sample')
    expect(JSON.stringify(index)).not.toContain('l5-sample')
    expect(index.modules.find((module) => module.id === 'tr2')?.published).toBe(true)
    expect(index.modules.find((module) => module.id === 'tr1')?.published).toBe(false)
  })

  test('the lesson rows are in lesson-index.json, in course order, and that file grows with them', () => {
    const rows = (result: typeof small) => lessonIndexSchema.parse(JSON.parse(file(result, 'lesson-index'))).modules.tr2 ?? []
    expect(rows(small)).toHaveLength(6)
    expect(rows(large)).toHaveLength(60)
    expect(rows(large)[0]?.route).toBe('/m/tr2/l0-sample')
    expect(file(large, 'lesson-index').length).toBeGreaterThan(file(small, 'lesson-index').length)
  })

  test('the real course: every module row says whether it is published, and the first lesson is the first module that has one', () => {
    const real = contentIndexSchema.parse(JSON.parse(read('src/content/generated/index.json')))
    const rows = lessonIndexSchema.parse(JSON.parse(read('src/content/generated/lesson-index.json'))).modules
    for (const module of real.modules) expect(module.published, module.id).toBe((rows[module.id] ?? []).length > 0)
    const first = real.modules.find((module) => module.published)
    expect(real.firstLesson?.module).toBe(first?.id)
    expect(real.firstLesson?.route).toBe(rows[first?.id ?? '']?.[0]?.route)
  })
})
