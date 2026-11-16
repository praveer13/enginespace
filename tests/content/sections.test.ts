/*
 * R-T10: the lesson template's sections (REDESIGN §2.5), `groupSections(blocks)` over every built lesson. It derives Run, Read, Test and
 * the opener from the file's shape, and the compiler derives the map's lessons table by the same rules, so the two are held together here:
 * a page whose rail said one thing and whose way on said another would leave the learner lost.
 */
import { describe, expect, test } from 'bun:test'
import { compiledLessonSchema, courseMapSchema } from '@es/schema'
import type { CompiledBlock, CompiledLesson } from '@es/schema'
import { groupSections, SETUP_WORDS, testLabel } from '@/content/render/sections'
import { compileContent } from '../../scripts/content/build.ts'
import { repo } from './support.ts'

const compiled = compileContent({ root: repo })
const lessons: CompiledLesson[] = compiled.outputs
  .filter((output) => output.path.startsWith('src/content/generated/lessons/'))
  .map((output) => compiledLessonSchema.parse(JSON.parse(output.text)))
const map = courseMapSchema.parse(JSON.parse(compiled.outputs.find((output) => output.path === 'src/content/generated/map.json')?.text ?? '{}'))
const rowOf = (id: string) => map.lessons.find((row) => row.id === id)
const ref = (block: CompiledBlock) => (block.type === 'game' ? `play:${block.id}/${block.level}` : '')

describe('groupSections', () => {
  test('runs over all 27 built lessons without error and gives each a Test', () => {
    expect(lessons.length).toBe(27)
    const problems = lessons.flatMap((lesson) => {
      const sections = groupSections(lesson.blocks)
      return sections.test.questions.length + sections.test.graded.length > 0 ? [] : [`${lesson.id} has no Test`]
    })
    expect(problems).toEqual([])
  })

  test("agrees with the map's lessons table: the opener, the Run's levels, the Test's questions and graded levels", () => {
    const words = { A: 'run', B: 'primer', C: 'read' } as const
    for (const lesson of lessons) {
      const sections = groupSections(lesson.blocks)
      const row = rowOf(lesson.id)
      expect(row).toBeDefined()
      if (row === undefined) continue
      expect({ id: lesson.id, opener: words[sections.opener] }).toEqual({ id: lesson.id, opener: row.opener })
      expect(sections.run?.games.map((at) => ref(lesson.blocks[at])) ?? []).toEqual(row.run)
      expect(sections.test.graded.map((at) => ref(lesson.blocks[at]))).toEqual(row.test.graded)
      const families = sections.test.questions.map((at) => lesson.blocks[at]).flatMap((block) => (block.type === 'item' ? [block.family] : []))
      expect(new Set(families)).toEqual(new Set(row.test.questions.map((question) => question.family)))
    }
  })

  test('a lesson whose first game follows its first heading has no Run, and opens on Read', () => {
    let seen = 0
    for (const lesson of lessons) {
      const firstGame = lesson.blocks.findIndex((block) => block.type === 'game')
      const firstHeading = lesson.blocks.findIndex((block) => block.type === 'prose' && block.body.some((flow) => flow.type === 'heading' && flow.depth === 2))
      if (firstGame >= 0 && firstGame < firstHeading) continue
      seen += 1
      const sections = groupSections(lesson.blocks)
      expect({ id: lesson.id, run: sections.run, opener: sections.opener }).toEqual({ id: lesson.id, run: null, opener: 'C' })
    }
    expect(seen).toBeGreaterThan(0)
  })

  test('a graded game block is always in Test, wherever it sits in the file', () => {
    for (const lesson of lessons) {
      const sections = groupSections(lesson.blocks)
      const graded = lesson.blocks.flatMap((block, at) => (block.type === 'game' && block.mode === 'graded' ? [at] : []))
      expect(sections.test.graded).toEqual(graded)
      const elsewhere = [...(sections.run?.pieces ?? []), ...sections.intro, ...sections.read.flatMap((part) => part.pieces), ...sections.test.pieces]
      expect(elsewhere.filter((piece) => piece.kind === 'block' && graded.includes(piece.at))).toEqual([])
    }
  })

  test('every block and every prose flow lands in exactly one place, and no notional-machine card is inlined', () => {
    for (const lesson of lessons) {
      const sections = groupSections(lesson.blocks)
      const pieces = [...(sections.run?.pieces ?? []), ...sections.intro, ...sections.read.flatMap((part) => part.pieces), ...sections.test.pieces]
      const blocks = [
        ...pieces.flatMap((piece) => (piece.kind === 'block' ? [piece.at] : [])),
        ...sections.test.questions,
        ...sections.test.graded,
        ...sections.cards,
        ...sections.labs,
        ...[...sections.slots.values()].flat().map((slot) => slot.at),
      ].sort((a, b) => a - b)
      expect(blocks).toEqual(lesson.blocks.flatMap((block, at) => (block.type === 'prose' ? [] : [at])))
      for (const piece of pieces) {
        const block = piece.kind === 'block' ? lesson.blocks[piece.at] : undefined
        expect(block?.type === 'card' && block.kind === 'notional-machine').toBe(false)
      }
      const flows = lesson.blocks.flatMap((block) => (block.type === 'prose' ? block.body.filter((flow) => !(flow.type === 'heading' && flow.depth === 2)) : []))
      expect(pieces.flatMap((piece) => (piece.kind === 'prose' ? piece.flows : [])).length).toBe(flows.length)
    }
  })

  test("a lesson whose Test is a graded level alone reads 'Test · graded level' (TR6 lesson 2, TR8 lessons 1 and 2)", () => {
    const label = (id: string) => {
      const lesson = lessons.find((candidate) => candidate.id === id)
      if (lesson === undefined) throw new Error(`no lesson ${id}`)
      const sections = groupSections(lesson.blocks)
      return testLabel(sections.test.questions.reduce((sum, at) => sum + (lesson.blocks[at].type === 'item' ? (lesson.blocks[at] as { count: number }).count : 0), 0), sections.test.graded.length)
    }
    expect(label('tr6.l2')).toBe('Test · graded level')
    expect(label('tr8.l1')).toBe('Test · graded level')
    expect(['Test · graded level', 'Test · 2 graded levels']).toContain(label('tr8.l2'))
    expect(label('tr5a.l1')).toBe('Test · 3 questions')
  })

  test('TR5a lesson 1 is the reference lesson: opener A, two levels in Run, its guess in the second level’s slot as one prompt', () => {
    const lesson = lessons.find((candidate) => candidate.id === 'tr5a.l1')
    if (lesson === undefined) throw new Error('no tr5a.l1')
    const sections = groupSections(lesson.blocks)
    expect(sections.opener).toBe('A')
    expect(sections.setupWords).toBeLessThanOrEqual(SETUP_WORDS)
    expect(sections.run?.games.map((at) => ref(lesson.blocks[at]))).toEqual(['play:pool/one-group', 'play:pool/two-kinds'])
    const second = sections.run?.games[1] ?? -1
    expect(sections.slots.get(second)).toEqual([{ at: expect.any(Number), paired: true }])
    expect(sections.cards.length).toBe(1)
    expect(sections.labs.length).toBe(1)
    expect(sections.read.length).toBe(5)
  })

  test('no more than two prompts come before a run’s first move, and no lesson asks one question twice', () => {
    // A level that opens on a guess of its own: every level but the step loop's demo levels and the broken benchmark's report.
    const opensOnGuess = (block: CompiledBlock) => block.type === 'game' && block.id !== 'broken-bench' && !(block.id === 'loop' && block.level.startsWith('first-'))
    for (const lesson of lessons) {
      const sections = groupSections(lesson.blocks)
      for (const [game, guesses] of sections.slots) {
        const paired = guesses.filter((guess) => guess.paired).length
        expect(paired).toBeLessThanOrEqual(1)
        const prompts = guesses.length + (opensOnGuess(lesson.blocks[game]) && paired === 0 ? 1 : 0)
        expect({ lesson: lesson.id, game, prompts: Math.min(prompts, 2) }).toEqual({ lesson: lesson.id, game, prompts })
      }
    }
  })
})
