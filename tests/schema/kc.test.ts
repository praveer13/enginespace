/*
 * W0-T07's acceptance check 1, for the KC graph (ARCHITECTURE §4.5): the schema rejects unknown keys and takes a KC and a
 * graph as §4.5 describes them. The curriculum files propose a graph, KC by KC; the test at the end runs all of it through the
 * schema, so the grammar and the graph checks meet real data.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { findRequiresCycle, kcGraphSchema, kcSchema } from '@es/schema/kc'
import type { Kc } from '@es/schema/kc'
import { between, fixture, keyRoles, objectPaths, problems, read, root, where, withKey, yaml } from './support'
import type { Path } from './support'

const architecture = read('docs/ARCHITECTURE.md')
const graph = yaml(fixture('kc-graph.yaml')) as Record<string, unknown>[]
const [tensorMetadata] = graph

/** A graph of KCs, each with the ids it requires. */
const dag = (edges: Record<string, string[]>): Record<string, unknown>[] =>
  Object.entries(edges).map(([id, requires]) => ({ id, description: `You can do ${id}.`, requires }))

describe("ARCHITECTURE §4.5's graph", () => {
  test('lists KCs with requires, confusable and threshold edges', () => {
    const text = between(architecture, '### 4.5 Knowledge components and refs', '### 4.6')
    expect(text).toContain('`content/kc/graph.yaml` lists KCs (`tr2.async-overlap`) with `requires`, `confusable` and `threshold` edges')
    const full = { id: 'tr2.async-overlap', description: 'You can say why.', requires: [], confusable: [], threshold: true, planned: 'W1-T14' }
    expect(kcSchema.safeParse(full).success).toBe(true)
    expect(keyRoles(kcSchema, full)).toEqual({
      required: ['description', 'id'],
      // The two edge lists default to empty, so a KC with no edges of that kind may leave them out.
      optional: ['confusable', 'planned', 'requires', 'threshold'],
    })
  })

  test('A§4.5’s own example id is a KC', () => {
    expect(kcSchema.safeParse({ id: 'tr2.async-overlap', description: 'x' }).success).toBe(true)
  })
})

describe('the fixture graph', () => {
  test('is a valid graph of the nine TR0 KCs', () => {
    const parsed = kcGraphSchema.parse(graph)
    expect(parsed.map((kc) => kc.id)).toEqual([
      'tr0.tensor-metadata',
      'tr0.view-vs-copy',
      'tr0.broadcast-stride-zero',
      'tr0.hidden-syncs',
      'tr0.module-as-struct',
      'tr0.decoder-forward',
      'tr0.kv-cache-contract',
      'tr0.triton-program-model',
      'tr0.triton-masks',
    ])
  })

  test('a KC with no edges of a kind gets an empty list', () => {
    const parsed = kcGraphSchema.parse(graph)
    const kc = parsed.find((candidate) => candidate.id === 'tr0.module-as-struct')
    expect(kc).toEqual({ id: 'tr0.module-as-struct', description: kc?.description as string, requires: [], confusable: [] })
  })

  test('edges may name kernelspace KCs and our own, and a threshold flag and a planned task come through', () => {
    const parsed = kcGraphSchema.parse(graph)
    expect(parsed[0].requires).toEqual(['ks:t0.stride-traversal', 'ks:t0.data-layout'])
    expect(parsed[0].threshold).toBe(true)
    expect(parsed[1].confusable).toEqual(['tr0.broadcast-stride-zero'])
    expect(parsed.find((kc) => kc.id === 'tr0.hidden-syncs')?.planned).toBe('W2-T18')
  })
})

describe('every KC rejects an unknown key', () => {
  test('in each KC of the fixture', () => {
    for (const kc of graph) {
      expect(problems(kcSchema, kc)).toEqual([])
      for (const path of objectPaths(kc)) {
        expect(problems(kcSchema, withKey(kc, [...path, 'zzz'], true))).toEqual([`${where(path)}: unrecognized_keys[zzz]`])
      }
    }
  })

  test('in the graph, where the path names the KC', () => {
    expect(problems(kcGraphSchema, withKey(graph, [1, 'zzz'], true))).toEqual(['1: unrecognized_keys[zzz]'])
    expect(problems(kcGraphSchema, withKey(graph, [3, 'planned_for'], 'W2-T18'))).toEqual(['3: unrecognized_keys[planned_for]'])
  })
})

describe('a KC', () => {
  const cases: [string, Path, unknown, string[]][] = [
    ['an id in capitals', ['id'], 'TR0.tensor-metadata', ['id: invalid_format']],
    ['an id of a module alone', ['id'], 'tr0', ['id: invalid_format']],
    ['an id that is kernelspace’s', ['id'], 'ks:t0.stride-traversal', ['id: invalid_format']],
    ['an id from a module that does not exist', ['id'], 'tr9.x', ['id: invalid_format']],
    ['a blank description', ['description'], ' ', ['description: invalid_format']],
    ['no description', ['description'], undefined, ['description: invalid_type']],
    ['a requirement that is a module', ['requires'], ['tr0'], ['requires.0: invalid_format']],
    ['a requirement that is a kernelspace lesson', ['requires'], ['ks:T5.L7'], ['requires.0: invalid_format']],
    ['a requirement named twice', ['requires'], ['tr0.module-as-struct', 'tr0.module-as-struct'], ['requires.1: custom']],
    ['a requirement that is text', ['requires'], 'tr0.module-as-struct', ['requires: invalid_type']],
    ['a confusable KC that is kernelspace’s', ['confusable'], ['ks:t0.stride-traversal'], ['confusable.0: invalid_format']],
    ['a confusable KC named twice', ['confusable'], ['tr0.a', 'tr0.a'], ['confusable.1: custom']],
    ['a threshold that is text', ['threshold'], 'core', ['threshold: invalid_type']],
    ['a planned task that is in lowercase', ['planned'], 'w1-t14', ['planned: invalid_format']],
    ['a planned task from a wave that does not exist', ['planned'], 'W4-T01', ['planned: invalid_format']],
    ['a planned task with one digit', ['planned'], 'W1-T1', ['planned: invalid_format']],
    ['a planned task that is a promise', ['planned'], 'soon', ['planned: invalid_format']],
    ['a planned task of a carry-over wave that does not exist', ['planned'], 'W2b-T01', ['planned: invalid_format']],
    ['a planned task of W1 with another letter', ['planned'], 'W1c-T01', ['planned: invalid_format']],
    ['a planned task of W1b in capitals', ['planned'], 'W1B-T01', ['planned: invalid_format']],
  ]
  for (const [name, at, to, expected] of cases) {
    test(`refuses ${name}`, () => expect(problems(kcSchema, withKey(tensorMetadata, at, to))).toEqual(expected))
  }

  test('takes a planned task of each wave', () => {
    for (const planned of ['W0-T01', 'W1-T03', 'W2-T18', 'W3-T17']) expect(problems(kcSchema, { ...tensorMetadata, planned })).toEqual([])
  })

  test('takes a planned task of W1b, W1’s carry-over, whose ids TRACKER.md has (W1b-report §10)', () => {
    for (const planned of ['W1b-T01', 'W1b-T08', 'W1b-T16']) expect(problems(kcSchema, { ...tensorMetadata, planned })).toEqual([])
  })

  test('takes the capstone’s KCs, which begin cap.', () => {
    expect(problems(kcSchema, { id: 'cap.paired-runs', description: 'x', requires: ['tr8.open-vs-closed', 'ks:t7.goodput'] })).toEqual([])
  })

  test('refuses a value that is not an object', () => {
    for (const value of [null, 'tr0.a', [], 7]) expect(kcSchema.safeParse(value).success).toBe(false)
  })
})

describe('the graph', () => {
  test('refuses an id defined twice, at the second place', () => {
    const first = { id: 'tr0.a', description: 'x' }
    expect(problems(kcGraphSchema, [first, { id: 'tr0.b', description: 'y' }, { ...first, description: 'z' }])).toEqual(['2.id: custom'])
  })

  test('refuses a requirement that is not in the graph, and says where', () => {
    const lonely = [{ id: 'tr0.a', description: 'x', requires: ['ks:t5.kv-capacity', 'tr0.missing'] }]
    expect(problems(kcGraphSchema, lonely)).toEqual(['0.requires.1: custom'])
  })

  test('refuses a confusable KC that is not in the graph, or is the KC itself', () => {
    const base = { id: 'tr0.a', description: 'x' }
    expect(problems(kcGraphSchema, [{ ...base, confusable: ['tr0.missing'] }])).toEqual(['0.confusable.0: custom'])
    expect(problems(kcGraphSchema, [{ ...base, confusable: ['tr0.a'] }])).toEqual(['0.confusable.0: custom'])
  })

  test('takes edges to kernelspace KCs that this file does not hold', () => {
    expect(problems(kcGraphSchema, [{ id: 'tr0.a', description: 'x', requires: ['ks:t7.not-checked-here'] }])).toEqual([])
  })

  test('takes an empty graph, and refuses what is not a list', () => {
    expect(problems(kcGraphSchema, [])).toEqual([])
    expect(problems(kcGraphSchema, { kcs: [] })).toEqual(['(root): invalid_type'])
  })

  test('takes a diamond, which is a DAG although two paths meet', () => {
    expect(problems(kcGraphSchema, dag({ 'tr1.top': ['tr1.left', 'tr1.right'], 'tr1.left': ['tr1.base'], 'tr1.right': ['tr1.base'], 'tr1.base': [] }))).toEqual([])
  })

  test('takes edges that point at KCs defined later in the file', () => {
    expect(problems(kcGraphSchema, dag({ 'tr1.b': ['tr1.a'], 'tr1.a': [] }))).toEqual([])
  })
})

describe('a cycle in requires', () => {
  test('a KC that requires itself', () => {
    expect(problems(kcGraphSchema, dag({ 'tr1.a': ['tr1.a'] }))).toEqual(['0.requires.0: custom'])
  })

  test('two KCs that require each other', () => {
    expect(problems(kcGraphSchema, dag({ 'tr1.a': ['tr1.b'], 'tr1.b': ['tr1.a'] }))).toEqual(['1.requires.0: custom'])
  })

  test('the fixture’s three: the issue names the cycle, and the edge that closes it', () => {
    const cyclic = yaml(fixture('invalid/kc-cycle.yaml'))
    const result = kcGraphSchema.safeParse(cyclic)
    expect(result.success).toBe(false)
    const issues = result.success ? [] : result.error.issues
    expect(issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['2.requires.0', 'requires has a cycle: tr1.a → tr1.b → tr1.c → tr1.a'],
    ])
  })

  test('a cycle that does not pass through the first KC', () => {
    expect(problems(kcGraphSchema, dag({ 'tr1.a': ['tr1.b'], 'tr1.b': ['tr1.c'], 'tr1.c': ['tr1.b'] }))).toEqual(['2.requires.0: custom'])
  })

  test('a cycle is reported once, however many there are', () => {
    const found = problems(kcGraphSchema, dag({ 'tr1.a': ['tr1.a'], 'tr1.b': ['tr1.b'] }))
    expect(found).toEqual(['0.requires.0: custom'])
  })

  test('an edge to a KC that is not there is reported, and the cycle check leaves it alone', () => {
    expect(problems(kcGraphSchema, dag({ 'tr1.a': ['tr1.missing'], 'tr1.b': ['tr1.c'], 'tr1.c': ['tr1.b'] }))).toEqual(['0.requires.0: custom', '2.requires.0: custom'])
  })
})

describe('findRequiresCycle', () => {
  /** KCs as the schema parses them, without the graph's own checks, so a cyclic one can be made. */
  const parsed = (edges: Record<string, string[]>): Kc[] => dag(edges).map((kc) => kcSchema.parse(kc))

  test('is null for a DAG', () => {
    expect(findRequiresCycle(parsed({ 'tr1.a': ['tr1.b', 'tr1.c'], 'tr1.b': ['tr1.c'], 'tr1.c': [] }))).toBeNull()
    expect(findRequiresCycle([])).toBeNull()
  })

  test('gives the ids from a KC round to itself, and the closing edge', () => {
    expect(findRequiresCycle(parsed({ 'tr1.a': ['tr1.b'], 'tr1.b': ['tr1.c'], 'tr1.c': ['tr1.a'] }))).toEqual({
      ids: ['tr1.a', 'tr1.b', 'tr1.c', 'tr1.a'],
      at: [2, 0],
    })
  })

  test('starts the cycle at the KC the walk reaches twice, not at the KC it began from', () => {
    expect(findRequiresCycle(parsed({ 'tr1.a': ['tr1.b'], 'tr1.b': ['tr1.c'], 'tr1.c': ['tr1.d', 'tr1.b'], 'tr1.d': [] }))).toEqual({
      ids: ['tr1.b', 'tr1.c', 'tr1.b'],
      at: [2, 1],
    })
  })

  test('skips kernelspace edges and edges to KCs that are not in the list', () => {
    expect(findRequiresCycle(parsed({ 'tr1.a': ['ks:t5.kv-capacity', 'tr1.nowhere'] }))).toBeNull()
  })

  test('walks a chain of five thousand KCs without recursion', () => {
    const edges: Record<string, string[]> = {}
    for (let i = 0; i < 5000; i += 1) edges[`tr1.k${i}`] = i + 1 < 5000 ? [`tr1.k${i + 1}`] : []
    expect(findRequiresCycle(parsed(edges))).toBeNull()
    edges['tr1.k4999'] = ['tr1.k0']
    const cycle = findRequiresCycle(parsed(edges))
    expect(cycle?.ids.length).toBe(5001)
    expect(cycle?.at).toEqual([4999, 0])
  })
})

describe('the curriculum’s proposed KCs', () => {
  /** The rows of a curriculum file's "Knowledge components" table: the KC in the first column, what it requires in the second. */
  function proposed(text: string): { id: string; requires: string[] }[] {
    const lines = text.slice(text.indexOf('**Knowledge components**')).split('\n').slice(1)
    const first = lines.findIndex((line) => line.startsWith('|'))
    const end = lines.findIndex((line, index) => index > first && !line.startsWith('|'))
    return lines
      .slice(first + 2, end < 0 ? undefined : end)
      .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
      .map(([kc, requires]) => ({
        id: /`([^`]+)`/.exec(kc)?.[1] ?? '',
        requires: [...requires.matchAll(/`([^`]+)`/g)].map((match) => match[1]),
      }))
  }

  const dir = path.join(root, 'curriculum')
  const modules = readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ name, text: read(`curriculum/${name}`) }))
    .filter(({ text }) => text.includes('**Knowledge components**'))
    .map(({ name, text }) => ({ name, kcs: proposed(text) }))

  test('each of the eleven modules proposes some', () => {
    expect(modules.length).toBeGreaterThanOrEqual(11)
    expect(modules.filter(({ kcs }) => kcs.length === 0).map(({ name }) => name)).toEqual([])
  })

  test('together they are a valid graph: ids are unique, every edge resolves, and nothing cycles', () => {
    const all = modules.flatMap(({ kcs }) => kcs).map((kc) => ({ ...kc, description: `You can do ${kc.id}.` }))
    expect(all.length).toBeGreaterThan(50)
    expect(problems(kcGraphSchema, all)).toEqual([])
  })
})
