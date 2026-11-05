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
import { courseMapSchema, courseSchema, kcGraphSchema } from '@es/schema'
import type { CourseMap } from '@es/schema'
import { BUDGETS } from '../../scripts/content/build.ts'
import { loadYaml } from '../../scripts/content/parse.ts'
import { read as readRepo, root } from '../ci/support'
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

  test('has a KC graph that is the five modules the plan writes in W1, and nothing for the modules that come later', () => {
    const withKcs = map.modules.filter((module) => module.kcs.length > 0).map((module) => module.id)
    expect(withKcs).toEqual(['tr1', 'tr2', 'tr5a', 'tr6', 'tr8'])
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
