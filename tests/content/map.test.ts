/*
 * W1-T06: what the course map and the module pages read, `src/content/generated/map.json` (ARCHITECTURE §3.1, §4.5), and the
 * prerequisites and artifacts that `content/course.yaml` now holds for the modules nobody has written yet.
 *
 * The map is compiled from content and holds nothing about a learner. A module that is written gives its own prerequisites,
 * artifacts and labs, and one that is not gives course.yaml's, which are copied from the module's curriculum file; these tests
 * read the curriculum, so a prerequisite that drifts from it fails here and not on a ticket.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { compiledLessonSchema, courseMapSchema, courseSchema, kcGraphSchema, lessonIndexSchema } from '@es/schema'
import type { CourseMap } from '@es/schema'
import { headingIds } from '@/content/render/model'
import { BUDGETS, compileContent, lessonRow } from '../../scripts/content/build.ts'
import { loadYaml } from '../../scripts/content/parse.ts'
import { read as readRepo, root } from '../ci/support'
import { OPENERS } from './openers-table.ts'
import { TOTAL_LESSONS } from './module-counts.ts'
import { COURSE, KCS, compile, lineOf, MODULE, output, read, swap, where } from './support.ts'

const MAP_JSON = 'src/content/generated/map.json'

function yaml(file: string): unknown {
  const loaded = loadYaml(read(file), file, 1, 'content', [])
  if (!loaded.ok) throw new Error(`${file} is not YAML`)
  return loaded.value
}

const sample = compile()
const map = courseMapSchema.parse(JSON.parse(output(sample, MAP_JSON)))
const course = courseSchema.parse(yaml(COURSE))
const graph = kcGraphSchema.parse(yaml(KCS))

describe('map.json', () => {
  test('is written with the other outputs, and validates against its schema', () => {
    expect(sample.outputs.map((o) => o.path)).toContain(MAP_JSON)
    expect(courseMapSchema.safeParse(JSON.parse(output(sample, MAP_JSON))).success).toBe(true)
  })

  test('is the same bytes twice', () => {
    expect(output(compile(), MAP_JSON)).toBe(output(sample, MAP_JSON))
  })

  test('is within its budget [estimated], which keeps it small enough for a page that reads it', () => {
    const size = gzipSync(Buffer.from(output(sample, MAP_JSON)), { level: 9 }).length
    expect(BUDGETS.map).toBe(12 * 1024)
    expect(size).toBeLessThanOrEqual(BUDGETS.map)
  })

  test('holds nothing of a learner: it is the course, and the same for everyone', () => {
    const text = output(sample, MAP_JSON)
    expect(text).not.toMatch(/"(?:earned|kept|practised|progress|status|events|score|ok|provenance)"/)
  })

  test('lists every module of course.yaml, in its order', () => {
    expect(map.modules.map((module) => module.id)).toEqual(course.modules.map((module) => module.id))
  })

  test('lists every KC of the graph with its module, its edges and its planned task, in the graph\'s order', () => {
    expect(map.kcs.map((kc) => kc.id)).toEqual(graph.map((kc) => kc.id))
    for (const [index, kc] of graph.entries()) {
      const made = map.kcs[index]
      expect(made.module).toBe(kc.id.startsWith('cap.') ? 'capstone' : kc.id.slice(0, kc.id.indexOf('.')))
      expect(made.requires).toEqual(kc.requires)
      expect(made.description).toBe(kc.description)
      expect(made.threshold).toBe(kc.threshold)
      expect(made.planned).toBe(kc.planned)
    }
  })

  test('gives each module its KCs, and every KC to exactly one module', () => {
    const owned = map.modules.flatMap((module) => module.kcs)
    expect([...owned].sort()).toEqual(map.kcs.map((kc) => kc.id).sort())
    for (const module of map.modules) for (const id of module.kcs) expect(map.kcs.find((kc) => kc.id === id)?.module).toBe(module.id)
  })

  test('gives the ref of every prediction the KCs its block names', () => {
    expect(map.refs).toEqual({ 'predict:tr2.l0#tr2.l0.p1': ['tr2.async-overlap'] })
  })

  test('has a KC graph that is the five modules the plan writes in W1 and TR0, whose design wrote its KCs ahead of its lessons (W2b-T26), and nothing for the modules that come later', () => {
    const withKcs = map.modules.filter((module) => module.kcs.length > 0).map((module) => module.id)
    expect(withKcs).toEqual(['tr0', 'tr1', 'tr2', 'tr5a', 'tr6', 'tr8'])
  })
})

describe('a module that is written gives its own prerequisites, artifacts and labs; one that is not gives course.yaml\'s', () => {
  test('TR2 is written: its module.md says what the map shows', () => {
    const tr2 = map.modules.find((module) => module.id === 'tr2')
    expect(tr2?.prereqs).toEqual(['ks:T5.L7', 'ks:T0.L6', 'ks:T4.L3'])
    expect(tr2?.artifacts).toEqual([{ id: 'loop', lane: 'B', title: 'The step-loop sim, toggled until the bubbles close' }])
  })

  test('a planned module shows what course.yaml holds, and no labs', () => {
    const tr3 = map.modules.find((module) => module.id === 'tr3')
    expect(tr3?.prereqs).toEqual(['ks:T0.L6', 'ks:T4.L3', 'tr2'])
    expect(tr3?.artifacts.map((artifact) => [artifact.id, artifact.lane])).toEqual([
      ['gap-hunt', 'B'],
      ['tr3.profile', 'F'],
    ])
    expect(tr3?.labs).toEqual([])
  })

  test('the module\'s file wins over course.yaml, and course.yaml\'s prerequisites for a written module are then ignored', () => {
    const edited = compile({ [MODULE]: swap('prereqs: [ks:T5.L7, ks:T0.L6, ks:T4.L3]', 'prereqs: [ks:T5.L7]') })
    const tr2 = (JSON.parse(output(edited, MAP_JSON)) as CourseMap).modules.find((module) => module.id === 'tr2')
    expect(tr2?.prereqs).toEqual(['ks:T5.L7'])
  })

  test('a module\'s labs are the labs its module.md lists', () => {
    const edited = compile({ [MODULE]: swap('games: [loop]', 'games: [loop]\nlabs: [hybrid-kv]') })
    expect(where(edited)).toEqual([])
    const tr2 = (JSON.parse(output(edited, MAP_JSON)) as CourseMap).modules.find((module) => module.id === 'tr2')
    expect(tr2?.labs).toEqual(['hybrid-kv'])
  })
})

describe('course.yaml\'s prerequisites and artifacts', () => {
  test.each([
    ['a prerequisite that is not a module of the course', swap('prereqs: [ks:T5.L7, ks:T0.L6, ks:T4.L3]', 'prereqs: [ks:T5.L7, tr1a]'), 'prereqs: [ks:T5.L7, ks:T0.L6, ks:T4.L3]'],
    ['a module that leans on itself', swap('prereqs: [ks:T5.L7, ks:T0.L6, ks:T4.L3]', 'prereqs: [tr2]'), 'prereqs: [ks:T5.L7, ks:T0.L6, ks:T4.L3]'],
    ['a prerequisite listed twice', swap('prereqs: [ks:T5.L7, ks:T0.L6, ks:T4.L3]', 'prereqs: [ks:T5.L7, ks:T5.L7]'), 'prereqs: [ks:T5.L7, ks:T0.L6, ks:T4.L3]'],
    ['an artifact in a lane the course does not have', swap('{ id: loop, lane: B,', '{ id: loop, lane: Z,'), '{ id: loop, lane: B,'],
  ] as const)('%s is one error with its file and line', (_, edit, needle) => {
    const result = compile({ [COURSE]: edit })
    const line = lineOf(read(COURSE), needle)
    expect(where(result)).toEqual([`${COURSE}:${line} schema`])
  })

  test('a key the schema does not know is one error with its file and line', () => {
    const line = lineOf(read(COURSE), '{ id: loop, lane: B,')
    expect(where(compile({ [COURSE]: swap('{ id: loop, lane: B,', '{ id: loop, speed: 3, lane: B,') }))).toEqual([`${COURSE}:${line} unknown-key`])
  })

  test('an artifact listed twice is an error', () => {
    const result = compile({ [COURSE]: swap("      - { id: loop, lane: B, title: 'The step-loop sim, toggled until the bubbles close' }\n", "      - { id: loop, lane: B, title: 'The step-loop sim, toggled until the bubbles close' }\n      - { id: loop, lane: B, title: 'Again' }\n") })
    expect(where(result)).toHaveLength(1)
    expect(where(result)[0]).toMatch(/^content\/course\.yaml:\d+ schema$/)
  })

  test('every lane with hours has an artifact, and no artifact is in a lane without hours', () => {
    for (const module of course.modules) {
      const lanes = Object.keys(module.hours_by_lane).sort()
      const worked = [...new Set((module.artifacts ?? []).map((artifact) => artifact.lane))].sort()
      expect([module.id, worked]).toEqual([module.id, lanes])
    }
  })

  test('every module has prerequisites and artifacts', () => {
    for (const module of course.modules) {
      expect([module.id, (module.prereqs ?? []).length > 0]).toEqual([module.id, true])
      expect([module.id, (module.artifacts ?? []).length > 0]).toEqual([module.id, true])
    }
  })

  test('says in its header what they are and where they come from', () => {
    const text = read(COURSE)
    expect(text).toContain('curriculum file')
    expect(text).toContain('advise and')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Held to the curriculum                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the prerequisites are the ones the module\'s curriculum file gives', () => {
  const FILES = readdirSync(path.join(root, 'curriculum')).filter((name) => name.endsWith('.md'))
  const fileOf = (id: string) => {
    const wanted = id === 'capstone' ? 'CAPSTONE' : id.toUpperCase().replace(/^TR(\d)([AB])$/, 'TR$1$2').replace(/([AB])$/, (letter) => letter.toLowerCase())
    const found = FILES.filter((name) => name.startsWith(`${wanted}-`) || name === `${wanted}.md`)
    expect(found, `a curriculum file for ${id} (${wanted})`).toHaveLength(1)
    return found[0]
  }
  /** The row "| **Prerequisites** | … |" of a curriculum file's "At a glance" table. */
  const row = (id: string) => /^\| \*\*Prerequisites\*\* \| (.*) \|$/m.exec(readRepo(`curriculum/${fileOf(id)}`))?.[1] ?? ''

  test.each(course.modules.map((module) => module.id))('%s', (id) => {
    const text = row(id)
    expect(text, `${id} has a Prerequisites row`).not.toBe('')
    // The blanket prerequisite, kernelspace T5 lessons 1 to 10, is the course's (PRODUCT.md), and a range is not a ref.
    const named = text.replace('T5.L1-T5.L10', '')
    const lessons = [...named.matchAll(/\bT([0-7])\.L(\d+)\b/g)].map((match) => `ks:T${match[1]}.L${match[2]}`)
    const entry = course.modules.find((module) => module.id === id)
    const kernelspace = (entry?.prereqs ?? []).filter((prereq) => prereq.startsWith('ks:'))
    expect([...kernelspace].sort()).toEqual([...new Set(lessons)].sort())
    // A module it names in the row is one it advises first (the capstone's row goes on to say which the chosen pair "may lean on").
    const advised = (entry?.prereqs ?? []).filter((prereq) => !prereq.startsWith('ks:'))
    const first = text.split('The pair chosen')[0]
    const mentioned = [...first.matchAll(/\bTR(\d[ab]?)\b/g)].map((match) => `tr${match[1]}`)
    expect([...advised].sort()).toEqual([...new Set(mentioned)].sort())
  })
})

describe('the artifacts are the ones the module\'s curriculum file gives', () => {
  const FILES = readdirSync(path.join(root, 'curriculum')).filter((name) => name.endsWith('.md'))
  const fileOf = (id: string) => FILES.find((name) => name.startsWith(id === 'capstone' ? 'CAPSTONE' : `TR${id.slice(2)}-`)) as string
  const row = (id: string) => /^\| \*\*Artifacts?\*\* \| (.*) \|$/m.exec(readRepo(`curriculum/${fileOf(id)}`))?.[1] ?? ''

  test.each(course.modules.map((module) => module.id))('%s works in the lanes its Artifact row marks', (id) => {
    const text = row(id)
    expect(text, `${id} has an Artifact row`).not.toBe('')
    // A row ends each artifact with its lane in brackets: "(B)", "(F)", "(L)", or "(both B)" for two.
    const marks = [...text.matchAll(/\((?:both )?([BLF])\)/g)].map((match) => match[1])
    const entry = course.modules.find((module) => module.id === id)
    const lanes = [...new Set((entry?.artifacts ?? []).map((artifact) => artifact.lane))].sort()
    expect([...new Set(marks)].sort()).toEqual(lanes)
  })
})

/*
 * R-T06: the lessons table (REDESIGN §2.4), which `nextStep` reads. The repository's own course is compiled here, and each row is held to
 * its lesson's compiled blocks by a reading of REDESIGN §2.5 written apart from the compiler's: the game blocks before the first `##` are
 * the Run, the practice ones after it are inline runs, every graded game block and the items of the last `##` part are the Test, and the
 * other items are checkpoints. The anchors are the ids the lesson page gives its headings (`headingIds`).
 */
describe('the lessons table', () => {
  const real = compileContent({ root })
  const realMap = courseMapSchema.parse(JSON.parse(output(real, MAP_JSON)))
  const lessonIndex = lessonIndexSchema.parse(JSON.parse(output(real, 'src/content/generated/lesson-index.json')))
  const built = Object.entries(lessonIndex.modules).flatMap(([module, rows]) => rows.map((lesson) => ({ module, lesson })))
  const lessonJson = (module: string, slug: string) => compiledLessonSchema.parse(JSON.parse(output(real, `src/content/generated/lessons/${module}.${slug}.json`)))

  test('has a row for each built lesson, in course order, and the map stays within its budget', () => {
    expect(realMap.lessons).toHaveLength(TOTAL_LESSONS)
    expect(realMap.lessons.map((row) => row.id)).toEqual(built.map(({ lesson }) => lesson.id))
    expect(realMap.lessons.map((row) => row.route)).toEqual(built.map(({ lesson }) => lesson.route))
    expect(gzipSync(output(real, MAP_JSON)).length).toBeLessThanOrEqual(BUDGETS.map)
  })

  test('every row has a non-empty Test, and the compiler warns on none', () => {
    for (const row of realMap.lessons) expect(row.test.questions.length + row.test.graded.length, row.id).toBeGreaterThan(0)
    expect(real.diagnostics.filter((d) => d.code === 'no-test')).toEqual([])
  })

  test("each row is its lesson's blocks: place, size, rev, runs, guesses, checkpoints, Test and anchors", () => {
    for (const { module, lesson: entry } of built) {
      const lesson = lessonJson(module, entry.slug)
      const row = realMap.lessons.find((candidate) => candidate.id === lesson.id)
      expect(row, lesson.id).toBeDefined()
      if (row === undefined) continue

      // The part each block sits in: 0 before the first `##`.
      const ids = headingIds(lesson.blocks)
      const parts: number[] = []
      const headings: string[] = []
      for (const block of lesson.blocks) {
        if (block.type === 'prose') {
          for (const flow of block.body) if (flow.type === 'heading' && flow.depth === 2) headings.push(ids.get(flow) ?? '')
        }
        parts.push(headings.length)
      }
      // A block's part is the count of `##` before it; a prose block's own headings come after anything it precedes.
      const partOf = (at: number) => (lesson.blocks[at].type === 'prose' ? -1 : parts[at])
      const last = headings.length
      const lastHolds = lesson.blocks.some((block, at) => partOf(at) === last && (block.type === 'item' || (block.type === 'game' && block.mode === 'graded')))
      const games = lesson.blocks.flatMap((block, at) => (block.type === 'game' ? [{ ref: `play:${block.id}/${block.level}`, graded: block.mode === 'graded', part: partOf(at) }] : []))
      const items = lesson.blocks.flatMap((block, at) => (block.type === 'item' ? [{ family: block.family, count: block.count, part: partOf(at) }] : []))
      const unique = (refs: string[]) => [...new Set(refs)]
      const sum = (rows: { family: string; count: number }[]) =>
        [...new Set(rows.map((one) => one.family))].map((family) => ({ family, count: rows.filter((one) => one.family === family).reduce((n, one) => n + one.count, 0) }))

      expect(row, lesson.id).toMatchObject({ module, route: entry.route, title: lesson.title, minutes: lesson.minutes, rev: lesson.rev })
      expect(row.needs, lesson.id).toEqual(lesson.lanes?.length ? lesson.lanes : ['B'])
      expect(row.run, lesson.id).toEqual(unique(games.filter((game) => !game.graded && game.part === 0).map((game) => game.ref)))
      expect(row.inline, lesson.id).toEqual(unique(games.filter((game) => !game.graded && game.part > 0).map((game) => game.ref)))
      expect(row.test.graded, lesson.id).toEqual(unique(games.filter((game) => game.graded).map((game) => game.ref)))
      expect(row.predicts, lesson.id).toEqual(lesson.blocks.flatMap((block) => (block.type === 'predict' ? [`predict:${lesson.id}#${block.id}`] : [])))
      const inTest = (part: number) => lastHolds && part === last
      expect(row.test.questions, lesson.id).toEqual(sum(items.filter((item) => inTest(item.part))))
      expect(row.checkpoints, lesson.id).toEqual(sum(items.filter((item) => !inTest(item.part))))
      expect(row.anchors.read, lesson.id).toBe(headings[0])
      expect(row.anchors.test, lesson.id).toBe(lastHolds ? headings.at(-1) : undefined)
      expect(row.opener, lesson.id).toBe(row.run.length === 0 ? 'read' : row.opener === 'run' ? 'run' : 'primer')
    }
  })

  test('the openers read from the shape of each file today: TR8 lesson 3, TR2 lesson 4 and TR1 lesson 1 open on a primer and a run, TR5a lesson 1 and TR2 lessons 1 and 3 on a run, and the rest on reading', () => {
    const openers = Object.fromEntries(realMap.lessons.map((row) => [row.id, row.opener]))
    expect(openers['tr8.l3']).toBe('primer')
    expect(openers['tr1.l1']).toBe('primer')
    expect(openers['tr5a.l1']).toBe('run')
    expect([openers['tr2.l1'], openers['tr2.l3'], openers['tr2.l4']]).toEqual(['run', 'run', 'primer'])
    // The openers table says which lessons open on reading: its C rows, and the A and B rows whose lesson is still waiting for its task.
    expect(Object.values(openers).filter((opener) => opener === 'read')).toHaveLength(OPENERS.filter((row) => row.opener === 'C' || row.waiting !== undefined).length)
  })

  test('a lesson whose last part holds no question and no graded level has no Test, and the compiler warns', () => {
    const plain = { type: 'prose' as const, body: [{ type: 'heading' as const, depth: 2 as const, children: [{ type: 'text' as const, text: 'Only part' }] }] }
    const front = { id: 'tr2.l9', module: 'tr2', title: 'No test', minutes: 5, kcs: [], builds_on: [], status: 'draft' as const }
    const row = lessonRow(front, 'l9-no-test', 'a'.repeat(64), [plain])
    expect(row.test).toEqual({ questions: [], graded: [] })
    expect(row.anchors).toEqual({ read: 'only-part' })
  })
})
