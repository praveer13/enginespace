/*
 * W2b-T18: the module test kit holds its own rule. A lesson that prints a table that the course's model computed, one with [synthetic] in its
 * header or its caption, is held only when the module's demos file carries the header row word for word and recomputes the rows. These tests
 * run the rule on fixture lessons, so that a rule which stopped finding tables would fail here and not pass every module in silence, and then
 * count the tables of the five built modules.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { findTables, modelTableProblems, modelTablesOf } from './module-kit.ts'
import type { ModelTable } from './module-kit.ts'
import { read, repo } from './support.ts'

const HEADER = '| Step | Decode rows [synthetic] | The forward, µs [synthetic] |'
const LESSON = [
  '---',
  'id: fixture.l1',
  '---',
  '',
  'Intro.',
  '',
  'The model counts these on its own run.',
  '',
  HEADER,
  '|---|---|---|',
  '| Before | 100 | 1,900 |',
  '| After | 101 | 2,278 |',
  '',
  'Outro.',
].join('\n')

const hold = (over: Partial<ModelTable> = {}): ModelTable => ({
  lesson: 'fixture.l1',
  header: HEADER,
  rows: () => [
    ['Before', '100', '1,900'],
    ['After', '101', '2,278'],
  ],
  ...over,
})
const demos = `export const MODEL_TABLES = [{ header: '${HEADER}' }]`
const texts = [{ id: 'fixture.l1', text: LESSON }]

describe('finding the model tables of a lesson', () => {
  test('a table with [synthetic] in its header is found, with its rows and its line', () => {
    const [table] = modelTablesOf(LESSON)
    expect(table.header).toBe(HEADER)
    expect(table.rows).toEqual([
      ['Before', '100', '1,900'],
      ['After', '101', '2,278'],
    ])
    expect(table.line).toBe(9)
  })

  test('a table whose caption carries [synthetic] is found, though its header carries none', () => {
    const text = 'The path has twenty-one stages [synthetic], counted by the model.\n\n| Stage | What |\n|---|---|\n| `a` | b |\n'
    expect(modelTablesOf(text).map((t) => t.header)).toEqual(['| Stage | What |'])
  })

  test('a table with no [synthetic] in its header or its caption is not a model table', () => {
    const text =
      'Read these.\n\n| File | Lines [measured] |\n|---|---|\n| `a.py` | 12 |\n\nA paragraph [synthetic].\n\nA caption with no tag.\n\n| One | Two |\n|---|---|\n| 1 | 2 |\n'
    expect(findTables(text).length).toBe(2)
    expect(modelTablesOf(text)).toEqual([])
  })

  test('a table inside a fenced block is no table', () => {
    expect(findTables('```\n| A [synthetic] | B |\n|---|---|\n| 1 | 2 |\n```\n')).toEqual([])
  })
})

describe('a model table is held, or the kit fails', () => {
  test('a table that its demos file holds, header word for word and rows recomputed, has no problem', () => {
    expect(modelTableProblems(texts, [hold()], demos)).toEqual([])
  })

  test('a fixture lesson with an unheld model table fails', () => {
    const problems = modelTableProblems(texts, [], demos)
    expect(problems.length).toBe(1)
    expect(problems[0]).toContain('fixture.l1:9 prints a model table that its demos file does not hold')
  })

  test('a hold whose header differs by one tag is not the table, and the table is unheld', () => {
    const problems = modelTableProblems(texts, [hold({ header: HEADER.replace('Decode rows [synthetic]', 'Decode rows [estimated]') })], demos)
    expect(problems.some((p) => p.includes('does not hold'))).toBe(true)
    expect(problems.some((p) => p.includes('no lesson prints'))).toBe(true)
  })

  test('a header that the demos file does not carry word for word fails, though the hold names it', () => {
    const problems = modelTableProblems(texts, [hold()], 'export const MODEL_TABLES = []')
    expect(problems.length).toBe(1)
    expect(problems[0]).toContain('fixture.l1:9 the demos file does not carry the header row word for word')
  })

  test('a row that the model recomputes differently fails, and names the line', () => {
    const stale = hold({
      rows: () => [
        ['Before', '100', '1,900'],
        ['After', '101', '2,300'],
      ],
    })
    expect(modelTableProblems(texts, [stale], demos)).toEqual(['fixture.l1:12 prints | After | 101 | 2,278 | and the model recomputes | After | 101 | 2,300 |'])
  })

  test('a table with more or fewer rows than the model recomputes fails', () => {
    const short = hold({ rows: () => [['Before', '100', '1,900']] })
    expect(modelTableProblems(texts, [short], demos)).toEqual([`fixture.l1:9 prints 2 rows and the model recomputes 1: ${HEADER}`])
  })

  test("a cell that no model computes is `null` and matches the lesson's own words", () => {
    const words = hold({
      rows: () => [
        [null, '100', '1,900'],
        ['After', '101', '2,278'],
      ],
    })
    expect(modelTableProblems(texts, [words], demos)).toEqual([])
  })

  test('a hold for a table that no lesson prints fails', () => {
    const problems = modelTableProblems(texts, [hold(), hold({ lesson: 'fixture.l2' })], demos)
    expect(problems).toEqual([`the demos file holds a table that no lesson prints: fixture.l2 ${HEADER}`])
  })

  test('the same header in two lessons is two tables, and each lesson is held on its own', () => {
    const both = [...texts, { id: 'fixture.l2', text: LESSON }]
    expect(modelTableProblems(both, [hold()], demos).length).toBe(1)
    expect(modelTableProblems(both, [hold(), hold({ lesson: 'fixture.l2' })], demos)).toEqual([])
  })
})

describe('the model tables of the five built modules', () => {
  // The count of tables that each module's lessons and cards print with [synthetic] in a header or a caption, which the module's demos file holds.
  const COUNTS: Readonly<Record<string, number>> = { tr1: 1, tr2: 9, tr5a: 1, tr6: 3, tr8: 6 }

  for (const [module_, count] of Object.entries(COUNTS)) {
    test(`${module_} prints ${count} model tables`, () => {
      const dir = path.join(repo, 'content/modules', module_, 'lessons')
      const found = readdirSync(dir)
        .filter((file) => file.endsWith('.md'))
        .flatMap((file) => modelTablesOf(read(`content/modules/${module_}/lessons/${file}`)))
      expect(found.length).toBe(count)
    })
  }
})
