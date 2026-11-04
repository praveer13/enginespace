/*
 * The compiler knows the games and the labs because it has been told, and the data it ships with (content/course.yaml) is copied
 * from the plan. These tests read the documents themselves, so a roster, a title or an hour that drifts from ARCHITECTURE.md,
 * PLAN.md or the curriculum fails here and not in a lesson. The KC graph is held to the curriculum in tests/kc/graph.test.ts.
 */
import { describe, expect, test } from 'bun:test'
import { courseSchema } from '@es/schema'
import { GAME_IDS, LAB_IDS } from '../../scripts/content/directives.ts'
import { loadYaml, parseContentFile } from '../../scripts/content/parse.ts'
import type { Diagnostic } from '../../scripts/content/parse.ts'
import { backticked, between, read, tableRows } from '../ci/support'

const architecture = read('docs/ARCHITECTURE.md')
const plan = read('docs/PLAN.md')

function yaml(file: string): unknown {
  const loaded = loadYaml(read(file), file, 1, 'content', [])
  if (!loaded.ok) throw new Error(`${file} is not YAML`)
  return loaded.value
}

describe('the games', () => {
  test('are the ids of ARCHITECTURE §6.1\'s roster, in its order', () => {
    const rows = tableRows(between(architecture, '### 6.1 Roster', '### 6.2'))
    expect(rows.map(([id]) => backticked(id)[0])).toEqual([...GAME_IDS])
  })

  test('are the ids of GAMES.md §0, in the same set', () => {
    const rows = tableRows(between(read('docs/GAMES.md'), '## 0. The games on one screen', 'A learner sees the display name'))
    expect(rows.map(([id]) => backticked(id)[0]).sort()).toEqual([...GAME_IDS].sort())
  })
})

describe('the labs', () => {
  const tree = /```\nlabs\/\n([\s\S]*?)\n```/.exec(between(architecture, '### 9.2 Layout under `labs/`', 'vLLM 0.33.0 and SGLang 0.5.23 pin'))?.[1] ?? ''

  /** The words of a line of the tree that name folders: `hybrid-kv/  rejection-sampler/  kv-publisher/`. */
  const folders = (line: string) => [...line.matchAll(/([a-z0-9-]+)\//g)].map((match) => match[1])

  test('the document\'s tree is where the lab folders are read from', () => {
    expect(tree).toContain('forge/')
    expect(tree).toContain('gpu/')
  })

  test('are the forge labs of the tree, and the GPU and local labs as <module>.<name>', () => {
    const lines = tree.split('\n')
    const forge = folders((lines.find((line) => line.includes('hybrid-kv/')) ?? '').split('each:')[0])
    const gpuAt = lines.findIndex((line) => /^ {2}gpu\//.test(line))
    const gpu = lines.slice(gpuAt + 1, gpuAt + 3).flatMap(folders)
    expect(forge).toEqual(['hybrid-kv', 'rejection-sampler', 'kv-publisher'])
    expect(gpu).toEqual(['tr0-forward', 'tr1-fork', 'tr3-profile', 'tr4-sweep', 'tr5b-connector', 'tr6-proposer', 'tr7-reproduce', 'tr8-replay', 'capstone'])
    // The capstone's one lab is capstone.pair (PLAN.md §5; the receipts are capstone.pair.s1 and .s2).
    const ids = gpu.map((folder) => (folder === 'capstone' ? 'capstone.pair' : folder.replace(/^(tr[0-8][ab]?)-/, '$1.')))
    expect([...forge, ...ids]).toEqual([...LAB_IDS])
    expect(read('docs/PLAN.md')).toContain('`capstone.pair`')
  })
})

describe('content/course.yaml', () => {
  const course = courseSchema.parse(yaml('content/course.yaml'))
  const rows = tableRows(between(plan, '## 4. Structure: modules, hours and lanes', '**The browser share.**'))

  /** A cell of PLAN §4's hours: a number, or a dash for none. */
  const hours = (cell: string) => (/^[\d.]+$/.test(cell.replaceAll('*', '')) ? Number(cell.replaceAll('*', '')) : undefined)

  test('lists the modules of ARCHITECTURE §3.1, in the order of the plan', () => {
    const ids = /\*\*Ids\.\*\* Module ids are (.*?)\. Lesson ids/.exec(architecture)?.[1] ?? ''
    expect(course.modules.map((m) => m.id)).toEqual(backticked(ids))
  })

  test('has each module\'s title and hours as PLAN §4 gives them', () => {
    const modules = rows.filter((row) => !row[0].startsWith('**Total'))
    expect(modules.length).toBe(course.modules.length)
    modules.forEach((row, index) => {
      const entry = course.modules[index]
      const name = /\[([^\]]+)\]/.exec(row[0])?.[1].toLowerCase()
      expect(name).toBe(entry.id)
      expect(row[1].replace(/^Capstone: /, '')).toBe(entry.title)
      const [b, l, f, total] = [row[2], row[3], row[4], row[5]].map(hours)
      expect(entry.hours_by_lane).toEqual({ ...(b === undefined ? {} : { B: b }), ...(l === undefined ? {} : { L: l }), ...(f === undefined ? {} : { F: f }) })
      expect(entry.hours).toBe(total as number)
    })
  })

  test('adds up to the plan\'s total, 91 hours', () => {
    const total = rows.find((row) => row[0].startsWith('**Total'))
    expect(course.modules.reduce((sum, m) => sum + m.hours, 0)).toBe(Number(total?.[5].replaceAll('*', '')))
    expect(course.modules.reduce((sum, m) => sum + m.hours, 0)).toBe(91)
  })

  test('tags its hours: a header comment says [estimated], and so does every line', () => {
    const text = read('content/course.yaml')
    expect(text).toContain('Hours are [estimated]')
    const hourLines = text.split('\n').filter((line) => /^\s+hours(_by_lane)?:/.test(line))
    expect(hourLines.length).toBe(course.modules.length * 2)
    expect(hourLines.filter((line) => !line.includes('# [estimated]'))).toEqual([])
  })
})

describe('the sample module', () => {
  const front = (text: string) => {
    const out: Diagnostic[] = []
    return parseContentFile('x.md', text, out)?.frontMatter as Record<string, unknown>
  }

  test('is the module of the schema tests\' A§4.2 fixture, and its world is the card that W0-T13 wrote', () => {
    const fixture = front(read('tests/fixtures/schema/module-tr2.md'))
    const sample = front(read('content/modules/tr2/module.md'))
    expect(sample).toEqual(fixture)
    expect(read('content/cards/trace-room-steploop.md')).toContain('id: trace-room-steploop')
  })
})
