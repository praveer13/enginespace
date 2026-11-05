/*
 * W1-T03's acceptance checks, on the graph the task wrote (content/kc/graph.yaml):
 *
 *   1. The graph is a DAG.
 *   2. Every KC has a description, and a graded reference (an item, a game level or a lab check) or the task that will add one.
 *      A `planned` placeholder stands until W1-T38, which fails on any that remain.
 *
 * And the graph against the documents it is written from: each curriculum file's table of proposed KCs, and the tracker's tasks.
 * The gate that enforces the rules is held to its own cases in verify-kc.test.ts; here it is run on the real files.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { GAMES } from '@es/play'
import { kcGraphSchema } from '@es/schema'
import type { Kc } from '@es/schema'
import { loadYaml } from '../../scripts/content/parse.ts'
import { untaggedNumbers } from '../../scripts/content/prose.ts'
import { GATES } from '../../scripts/verify.ts'
import { checkKc, courseModules, gameReferences, itemReferences, trackerTasks } from '../../scripts/verify-kc.ts'
import { parseSnapshot } from '../../scripts/kc/kernelspace.ts'
import { between, read, root } from '../ci/support'

const text = read('content/kc/graph.yaml')
const loaded = loadYaml(text, 'content/kc/graph.yaml', 1, 'kc', [])
const graph: readonly Kc[] = kcGraphSchema.parse(loaded.ok ? loaded.value : undefined)
const moduleOf = (kc: Kc) => kc.id.slice(0, kc.id.indexOf('.'))

/** The five modules W1 ships, each with the curriculum file that proposes its KCs. */
const MODULES = [
  ['tr1', 'curriculum/TR1-read-the-engines.md'],
  ['tr2', 'curriculum/TR2-the-step-loop.md'],
  ['tr5a', 'curriculum/TR5a-hybrid-kv-and-adapter-pages.md'],
  ['tr6', 'curriculum/TR6-speculation-and-structure.md'],
  ['tr8', 'curriculum/TR8-benchmark-like-you-mean-it.md'],
] as const

/** The rows of a curriculum file's table of KCs: the KC in the first column, what it requires in the second. */
function proposed(file: string): { id: string; requires: string[] }[] {
  const section = between(read(file), '**Knowledge components**', '\n## ')
  const rows = section.split('\n').filter((line) => line.startsWith('|')).slice(2)
  return rows.map((row) => {
    const [kc, requires] = row.split('|').slice(1, -1)
    return { id: /`([^`]+)`/.exec(kc)?.[1] ?? '', requires: [...requires.matchAll(/`([^`]+)`/g)].map((match) => match[1]) }
  })
}

describe('1. the graph is a DAG', () => {
  test('parses through the schema, which refuses a cycle, a dangling edge and a repeated id', () => {
    expect(graph.length).toBeGreaterThan(40)
  })

  test('has an order in which every KC comes after the ones it requires (Kahn\'s algorithm, apart from the schema\'s own walk)', () => {
    const ours = new Set(graph.map((kc) => kc.id))
    const waiting = new Map(graph.map((kc) => [kc.id, new Set(kc.requires.filter((need) => ours.has(need)))]))
    const order: string[] = []
    for (let ready = [...waiting].filter(([, needs]) => needs.size === 0).map(([id]) => id); ready.length > 0; ) {
      const id = ready.shift() as string
      order.push(id)
      waiting.delete(id)
      for (const [other, needs] of waiting) {
        if (needs.delete(id) && needs.size === 0) ready.push(other)
      }
    }
    expect(order.length).toBe(graph.length)
  })

  test('has its KCs in the order of the modules, and edges from a module only to itself, an earlier module, or kernelspace', () => {
    const rank = new Map<string, number>(MODULES.map(([module], index) => [module, index]))
    const modules = graph.map(moduleOf)
    expect(modules.every((module) => rank.has(module))).toBe(true)
    expect([...modules.map((module) => rank.get(module) as number)]).toEqual([...modules.map((module) => rank.get(module) as number)].sort((a, b) => a - b))
    for (const kc of graph) {
      for (const need of kc.requires.filter((edge) => !edge.startsWith('ks:'))) {
        expect([kc.id, need, (rank.get(need.slice(0, need.indexOf('.'))) ?? 99) <= (rank.get(moduleOf(kc)) as number)]).toEqual([kc.id, need, true])
      }
    }
  })
})

describe('2. every KC has a description, and a reference or a planned task', () => {
  test('holds the KCs of TR1, TR2, TR5a, TR6 and TR8, and no others', () => {
    expect([...new Set(graph.map(moduleOf))]).toEqual(MODULES.map(([module]) => module))
  })

  test('every description says what the learner can do, and holds no number that lacks a tag', () => {
    for (const kc of graph) {
      expect([kc.id, kc.description.startsWith('You can ')]).toEqual([kc.id, true])
      expect([kc.id, untaggedNumbers(kc.description)]).toEqual([kc.id, []])
    }
  })

  test('the gate passes on it, with the real registry, item families, course, tracker and kernelspace snapshot', async () => {
    const snapshot = parseSnapshot(read('content/kc/kernelspace.json')).snapshot ?? null
    expect(snapshot).not.toBeNull()
    // The item families name KCs too (W1-T04's, and W1-T14's two for the capture): the gate reads them with the games.
    const items = await itemReferences(root)
    expect(items.diagnostics).toEqual([])
    const result = checkKc({ text, references: [...gameReferences(GAMES.games), ...items.references], modules: courseModules(root), tasks: trackerTasks(root), kernelspace: snapshot, final: false })
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(result.stats?.kcs).toBe(graph.length)
  })

  test('a KC with no graded reference carries a task of W1 that comes before the exit review', async () => {
    const tasks = trackerTasks(root) as Set<string>
    const items = await itemReferences(root)
    const referenced = new Set([...gameReferences(GAMES.games), ...items.references].filter((reference) => reference.graded).flatMap((reference) => reference.kcs))
    for (const kc of graph) {
      if (referenced.has(kc.id)) continue
      const task = kc.planned ?? ''
      expect([kc.id, tasks.has(task), /^W1-T\d\d$/.test(task) && task < 'W1-T38']).toEqual([kc.id, true, true])
    }
  })

  test('the games already in the registry name KCs of the graph', () => {
    const ids = new Set(graph.map((kc) => kc.id))
    for (const game of GAMES.games) for (const id of game.kcs) expect([game.id, id, ids.has(id)]).toEqual([game.id, id, true])
  })
})

describe('the graph against the curriculum', () => {
  for (const [module, file] of MODULES) {
    describe(`${module}: ${file}`, () => {
      const table = proposed(file)
      const mine = graph.filter((kc) => moduleOf(kc) === module)

      test('lists the KCs of the curriculum\'s table, in its order', () => {
        expect(table.length).toBeGreaterThan(5)
        expect(mine.map((kc) => kc.id)).toEqual(table.map((row) => row.id))
      })

      test('has the table\'s edges, edge for edge', () => {
        expect(mine.map((kc) => ({ id: kc.id, requires: [...kc.requires].sort() }))).toEqual(table.map((row) => ({ id: row.id, requires: [...row.requires].sort() })))
      })
    })
  }

  test('the kernelspace KCs it names are the ones the five tables name', () => {
    const named = new Set(graph.flatMap((kc) => kc.requires.filter((need) => need.startsWith('ks:'))))
    const tables = new Set(MODULES.flatMap(([, file]) => proposed(file).flatMap((row) => row.requires.filter((need) => need.startsWith('ks:')))))
    expect([...named].sort()).toEqual([...tables].sort())
  })
})

describe('the kernelspace snapshot', () => {
  const snapshot = parseSnapshot(read('content/kc/kernelspace.json')).snapshot

  test('holds every kernelspace KC that any curriculum file names, so that the later modules\' tables will pass too', () => {
    const named = new Set(
      ['TR0-pytorch-for-rust.md', 'TR1-read-the-engines.md', 'TR2-the-step-loop.md', 'TR3-profile-a-real-engine.md', 'TR4-backends-as-a-consumer.md', 'TR5a-hybrid-kv-and-adapter-pages.md', 'TR5b-offload-connector-events.md', 'TR6-speculation-and-structure.md', 'TR7-contribute-honestly.md', 'TR8-benchmark-like-you-mean-it.md', 'CAPSTONE.md']
        .flatMap((file) => [...read(`curriculum/${file}`).matchAll(/`ks:((?:r|t[0-7])\.[a-z0-9-]+)`/g)])
        .map((match) => match[1]),
    )
    expect(named.size).toBeGreaterThan(30)
    expect([...named].filter((id) => !snapshot?.ids.includes(id))).toEqual([])
  })
})

describe('the gate, through the registry', () => {
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/verify.ts'), ...args], { encoding: 'utf8' })
    return { status: result.status, out: result.stdout }
  }

  test('verify:kc is wired to its script, built by W1-T03, and passes on the repository', () => {
    expect(GATES.kc.parts).toEqual([{ task: 'W1-T03', script: 'scripts/verify-kc.ts', args: [] }])
    const { status, out } = run('kc')
    expect(status).toBe(0)
    expect(out).toContain('$ bun scripts/verify-kc.ts')
    expect(out).toMatch(/verify:kc passed: \d+ KCs/)
    expect(out).not.toContain('pending')
  })

  test('is listed as live', () => {
    expect(run('list').out.split('\n').find((line) => line.startsWith('kc '))).toMatch(/^kc +source +live +W1-T03 +scripts\/verify-kc\.ts$/)
  })
})
