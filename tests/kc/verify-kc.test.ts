/*
 * W1-T03's gate, scripts/verify-kc.ts: what `verify:kc` fails on and what it only warns about, each on the line of the graph that
 * is at fault.
 *
 *   - `checkKc` is the gate over what it is given, so most tests hand it a graph held in memory.
 *   - The sources of references (the game registry, the item families, the kernelspace snapshot) are tried on small trees made here.
 *   - The command line is run as a process on a tree of its own, with `--root`, because the gate is a script that CI runs.
 *
 * The committed graph, and its fit with the curriculum, are tests/kc/graph.test.ts.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { GAMES } from '@es/play'
import type { GameEntry } from '@es/play'
import { kcGraphSchema } from '@es/schema'
import { loadYaml } from '../../scripts/content/parse.ts'
import { renderSnapshot } from '../../scripts/kc/kernelspace.ts'
import { checkKc, CONFUSABLE_MAX, courseModules, dependentCounts, gameReferences, itemReferences, readKernelspace, THRESHOLD_DEPENDENTS, trackerTasks } from '../../scripts/verify-kc.ts'
import type { KcInput, Reference } from '../../scripts/verify-kc.ts'
import { root } from '../ci/support'

const scratch: string[] = []
afterAll(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })))
/** A new directory outside the repository, removed when the file ends. */
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'enginespace-kc-'))
  scratch.push(dir)
  return dir
}
function put(dir: string, files: Record<string, string>): string {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), text)
  }
  return dir
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Graphs held in memory                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** One KC of a graph: its id, a description that begins as one must, and the keys given. */
const kc = (id: string, keys: Record<string, string> = {}): string =>
  [`- id: ${id}`, `  description: You can do ${id}.`, ...Object.entries(keys).map(([key, value]) => `  ${key}: ${value}`)].join('\n')
const graphOf = (...entries: string[]): string => `${entries.join('\n\n')}\n`

/** The 1-based line of the first line of `text` that holds `needle`, after the line that holds `after` when it is given. */
function lineOf(text: string, needle: string, after?: string): number {
  const lines = text.split('\n')
  const from = after === undefined ? 0 : lines.findIndex((line) => line.includes(after))
  const index = lines.findIndex((line, i) => i >= from && line.includes(needle))
  if (index < 0) throw new Error(`no line has "${needle}"`)
  return index + 1
}

const PLANNED = { planned: 'W1-T14' }
const item = (name: string, kcs: string[], graded = true): Reference => ({ kind: 'item', name, file: 'packages/play/items/x.ts', kcs, graded })

/** The gate with nothing to check names against, unless the test gives it something. */
function run(text: string, over: Partial<KcInput> = {}) {
  return checkKc({ text, references: [], modules: null, tasks: null, kernelspace: null, final: false, ...over })
}
/** What the gate said, as `severity code line`. */
const said = (result: ReturnType<typeof run>) => result.diagnostics.map((d) => `${d.severity} ${d.code} ${d.file}:${d.line}`)
const GRAPH = 'content/kc/graph.yaml'

describe('a graph that is fine', () => {
  const text = graphOf(kc('tr1.a'), kc('tr1.b', PLANNED), kc('tr2.c', { requires: '[tr1.a, tr1.b, ks:t5.kv-capacity]', planned: 'W1-T15' }))

  test('passes, and counts what it saw', () => {
    const result = run(text, { references: [item('item:gen/tr1.a', ['tr1.a'])], kernelspace: { commit: 'a'.repeat(40), source: '', ids: ['t5.kv-capacity'] } })
    expect(said(result)).toEqual([])
    expect(result.stats).toEqual({ kcs: 3, byModule: [['tr1', 2], ['tr2', 1]], thresholds: 0, confusablePairs: 0, kernelspaceKcs: 1, planned: 2, referenced: 1 })
  })

  test('says nothing of a name it has nothing to check against', () => {
    expect(said(run(text, { references: [item('item:gen/tr1.a', ['tr1.a'])], modules: null, tasks: null, kernelspace: null }))).toEqual([])
  })
})

describe('the schema, reached through the gate', () => {
  test('a cycle is one error, at the edge that closes it, and names the KCs round it', () => {
    const text = graphOf(kc('tr1.a', { requires: '[tr1.b]', ...PLANNED }), kc('tr1.b', { requires: '[tr1.c]', ...PLANNED }), kc('tr1.c', { requires: '[tr1.a]', ...PLANNED }))
    const result = run(text)
    expect(said(result)).toEqual([`error schema ${GRAPH}:${lineOf(text, 'requires: [tr1.a]')}`])
    expect(result.diagnostics[0].message).toContain('requires has a cycle: tr1.a → tr1.b → tr1.c → tr1.a')
    expect(result.stats).toBeNull()
  })

  test('a KC that requires itself is a cycle of one', () => {
    const text = graphOf(kc('tr1.a', { requires: '[tr1.a]', ...PLANNED }))
    expect(said(run(text))).toEqual([`error schema ${GRAPH}:${lineOf(text, 'requires')}`])
  })

  test('an edge to a KC that is not in the graph and a KC defined twice each stand on their own line', () => {
    const text = graphOf(kc('tr1.a', { requires: '[tr1.nowhere]', ...PLANNED }), kc('tr1.a', PLANNED))
    expect(said(run(text))).toEqual([`error schema ${GRAPH}:${lineOf(text, 'requires: [tr1.nowhere]')}`, `error schema ${GRAPH}:${lineOf(text, 'id: tr1.a', 'tr1.nowhere')}`])
  })

  test('a key it does not know is named on its line, and stops the checks that need a graph that has parsed', () => {
    const text = graphOf(kc('tr1.a', { requires: '[tr1.nowhere]', ...PLANNED }), kc('tr1.b', { colour: 'red', ...PLANNED }))
    const result = run(text)
    expect(said(result)).toEqual([`error unknown-key ${GRAPH}:${lineOf(text, 'colour')}`])
    expect(result.diagnostics[0].message).toContain('unknown key "colour"')
    expect(result.diagnostics[0].message).toContain('a KC takes id, description, requires, confusable, threshold, planned')
  })

  test('a diamond is a DAG, although two paths meet', () => {
    const text = graphOf(
      kc('tr1.top', { requires: '[tr1.left, tr1.right]', ...PLANNED }),
      kc('tr1.left', { requires: '[tr1.base]', ...PLANNED }),
      kc('tr1.right', { requires: '[tr1.base]', ...PLANNED }),
      kc('tr1.base', PLANNED),
    )
    expect(said(run(text))).toEqual([])
  })

  test('YAML that does not parse, and a file that is not a list, are errors', () => {
    expect(said(run('- id: tr1.a\n  description: [unclosed\n'))).toEqual([`error bad-yaml ${GRAPH}:${3}`])
    expect(said(run('kcs: []\n'))).toEqual([`error schema ${GRAPH}:1`])
  })
})

describe('descriptions', () => {
  test('begin "You can", the line that kernelspace\'s `can` follows', () => {
    const text = '- id: tr1.a\n  description: Knows what a queue is.\n  planned: W1-T14\n'
    const result = run(text)
    expect(said(result)).toEqual([`error description-voice ${GRAPH}:2`])
    expect(result.diagnostics[0].message).toContain('begins "You can"')
  })

  test('a blank one is the schema\'s error', () => {
    expect(said(run('- id: tr1.a\n  description: " "\n  planned: W1-T14\n'))).toEqual([`error schema ${GRAPH}:2`])
  })
})

describe('modules', () => {
  const text = graphOf(kc('tr5a.x', PLANNED), kc('tr5b.y', PLANNED), kc('cap.z', PLANNED))

  test('a KC belongs to a module that course.yaml has, and the capstone\'s KCs are `cap.`', () => {
    expect(said(run(text, { modules: new Set(['tr5a', 'tr5b', 'capstone']) }))).toEqual([])
  })

  test('a module that course.yaml lacks is an error on the id', () => {
    const result = run(text, { modules: new Set(['tr5a', 'capstone']) })
    expect(said(result)).toEqual([`error unknown-module ${GRAPH}:${lineOf(text, 'id: tr5b.y')}`])
    expect(result.diagnostics[0].message).toContain('no module "tr5b"')
    expect(said(run(text, { modules: new Set(['tr5a', 'tr5b']) }))).toEqual([`error unknown-module ${GRAPH}:${lineOf(text, 'id: cap.z')}`])
  })
})

describe('kernelspace edges', () => {
  const snapshot = { commit: 'd478f91a0af590f03fcfd76ee73149fa70b28e51', source: '', ids: ['t0.wait-bars', 't5.kv-capacity'] }
  const text = graphOf(kc('tr2.a', { requires: '[ks:t0.wait-bars, ks:t5.kv-cap]', ...PLANNED }), kc('tr2.b', { requires: '[ks:t5.kv-capacity, tr2.a, ks:t0.wait-bars]', ...PLANNED }))

  test('name a KC that the snapshot has, or fail on the edge', () => {
    const result = run(text, { kernelspace: snapshot })
    expect(said(result)).toEqual([`error unknown-ks-kc ${GRAPH}:${lineOf(text, 'ks:t5.kv-cap]')}`])
    expect(result.diagnostics[0].message).toContain('kernelspace has no KC "t5.kv-cap" at d478f91a0af5')
  })

  test('are counted once each, however often they are named', () => {
    expect(run(text, { kernelspace: snapshot }).stats?.kernelspaceKcs).toBe(3)
  })

  test('are not judged without a snapshot', () => {
    expect(said(run(text))).toEqual([])
  })
})

describe('confusable', () => {
  test('is symmetric, or the KC that lists the other fails on the edge', () => {
    const text = graphOf(kc('tr1.a', { confusable: '[tr1.b]', ...PLANNED }), kc('tr1.b', PLANNED))
    const result = run(text)
    expect(said(result)).toEqual([`error asymmetric-confusable ${GRAPH}:${lineOf(text, 'confusable')}`])
    expect(result.diagnostics[0].message).toContain('tr1.b does not list tr1.a')
  })

  test('counts a pair once, and has at most three entries', () => {
    const fine = graphOf(kc('tr1.a', { confusable: '[tr1.b, tr1.c]', ...PLANNED }), kc('tr1.b', { confusable: '[tr1.a]', ...PLANNED }), kc('tr1.c', { confusable: '[tr1.a]', ...PLANNED }))
    expect(run(fine).stats?.confusablePairs).toBe(2)
    expect(said(run(fine))).toEqual([])

    expect(CONFUSABLE_MAX).toBe(3)
    const others = ['tr1.b', 'tr1.c', 'tr1.d', 'tr1.e']
    const text = graphOf(kc('tr1.a', { confusable: `[${others.join(', ')}]`, ...PLANNED }), ...others.map((id) => kc(id, { confusable: '[tr1.a]', ...PLANNED })))
    expect(said(run(text))).toEqual([`error confusable-limit ${GRAPH}:${lineOf(text, 'confusable')}`])
  })
})

describe('thresholds', () => {
  /** `tr1.k0` is leaned on by the KCs after it, each requiring the one before: k0 has four dependents, k1 three, and so on. */
  const chain = (flags: Record<string, boolean>) =>
    graphOf(...[0, 1, 2, 3, 4].map((n) => kc(`tr1.k${n}`, { ...(n > 0 ? { requires: `[tr1.k${n - 1}]` } : {}), ...(flags[`tr1.k${n}`] ? { threshold: 'true' } : {}), ...PLANNED })))

  test('a KC leaned on by four, directly or through a chain, may be flagged', () => {
    expect(THRESHOLD_DEPENDENTS).toBe(4)
    expect(said(run(chain({ 'tr1.k0': true })))).toEqual([])
    expect(run(chain({ 'tr1.k0': true })).stats?.thresholds).toBe(1)
  })

  test('a flag on a KC that fewer lean on fails on the flag, and says how many do', () => {
    const text = chain({ 'tr1.k0': true, 'tr1.k1': true })
    const result = run(text)
    expect(said(result)).toEqual([`error threshold-leaf ${GRAPH}:${lineOf(text, 'threshold: true', 'id: tr1.k1')}`])
    expect(result.diagnostics[0].message).toContain('3 KCs lean on it')
  })

  test('a KC that qualifies and is not flagged is a warning on its entry, and the gate still passes', () => {
    const text = chain({})
    const result = run(text)
    expect(said(result)).toEqual([`warning threshold-candidate ${GRAPH}:${lineOf(text, 'id: tr1.k0')}`])
    expect(result.diagnostics[0].message).toContain('4 KCs lean on it')
  })

  test('fan-in counts the same as a chain, and a KC that two paths reach is counted once', () => {
    const text = graphOf(
      kc('tr1.base', { threshold: 'true', ...PLANNED }),
      kc('tr1.l', { requires: '[tr1.base]', ...PLANNED }),
      kc('tr1.r', { requires: '[tr1.base]', ...PLANNED }),
      kc('tr1.top', { requires: '[tr1.l, tr1.r]', ...PLANNED }),
    )
    expect(dependentCounts(kcGraphSchema.parse(loadedYaml(text)))).toEqual(
      new Map([
        ['tr1.base', 3],
        ['tr1.l', 1],
        ['tr1.r', 1],
        ['tr1.top', 0],
      ]),
    )
    expect(said(run(text))).toEqual([`error threshold-leaf ${GRAPH}:${lineOf(text, 'threshold: true')}`])
  })
})

/** The value of a YAML text, for a test that wants the parsed graph. */
function loadedYaml(text: string): unknown {
  const loaded = loadYaml(text, GRAPH, 1, 'kc', [])
  if (!loaded.ok) throw new Error('not YAML')
  return loaded.value
}

describe('references', () => {
  const text = graphOf(kc('tr1.a'), kc('tr1.b', PLANNED))

  test('a KC needs a graded item, game level or lab check, or a planned task', () => {
    const result = run(text)
    expect(said(result)).toEqual([`error no-reference ${GRAPH}:${lineOf(text, 'id: tr1.a')}`])
    expect(result.diagnostics[0].message).toContain('no graded item, game level or lab check names it')
    expect(said(run(text, { references: [item('item:gen/tr1.a', ['tr1.a'])] }))).toEqual([])
  })

  test('a game with no graded level is not one: a practice level writes at most practice credit', () => {
    const game: Reference = { kind: 'level', name: 'play:loop', file: 'packages/play/registry.ts', kcs: ['tr1.a'], graded: false }
    const result = run(text, { references: [game] })
    expect(said(result)).toEqual([`error no-reference ${GRAPH}:${lineOf(text, 'id: tr1.a')}`])
    expect(result.diagnostics[0].message).toContain('play:loop names it, and has no graded level')
    expect(said(run(text, { references: [{ ...game, graded: true }] }))).toEqual([])
  })

  test('a planned KC may have no reference yet, and says so when one has landed', () => {
    const result = run(text, { references: [item('item:gen/tr1.a', ['tr1.a']), item('item:gen/tr1.b', ['tr1.b'])] })
    expect(said(result)).toEqual([`warning stale-planned ${GRAPH}:${lineOf(text, 'planned')}`])
    expect(result.diagnostics[0].message).toContain('item:gen/tr1.b already names it')
    expect(result.stats).toMatchObject({ referenced: 2, planned: 1 })
  })

  test('planned names a task of the tracker, when there is a tracker to read', () => {
    const tasks = new Set(['W1-T14'])
    expect(said(run(text, { references: [item('item:gen/tr1.a', ['tr1.a'])], tasks }))).toEqual([])
    const wrong = graphOf(kc('tr1.a', { planned: 'W1-T99' }))
    const result = run(wrong, { tasks })
    expect(said(result)).toEqual([`error unknown-task ${GRAPH}:${lineOf(wrong, 'planned')}`])
    expect(result.diagnostics[0].message).toContain('docs/TRACKER.md has no such task')
    expect(said(run(wrong))).toEqual([])
  })

  test('--final fails on every placeholder that remains, and says nothing of those that have no reference', () => {
    const result = run(text, { references: [item('item:gen/tr1.a', ['tr1.a']), item('item:gen/tr1.b', ['tr1.b'])], final: true })
    expect(said(result)).toEqual([`error planned-remaining ${GRAPH}:${lineOf(text, 'planned')}`])
    expect(result.diagnostics[0].message).toContain('W1-T38 allows no placeholder')
    expect(said(run(graphOf(kc('tr1.a')), { references: [item('item:gen/tr1.a', ['tr1.a'])], final: true }))).toEqual([])
  })

  test('an item, game level or lab check names a KC, and one that the graph has', () => {
    const result = run(text, {
      references: [item('item:gen/tr1.a', ['tr1.a']), item('item:gen/tr1.empty', []), item('item:gen/tr1.wrong', ['tr1.a', 'tr1.ghost'])],
    })
    expect(said(result)).toEqual([`error reference-no-kc packages/play/items/x.ts:1`, `error reference-unknown-kc packages/play/items/x.ts:1`])
    expect(result.diagnostics[0].message).toContain('item:gen/tr1.empty names no KC')
    expect(result.diagnostics[1].message).toContain('item:gen/tr1.wrong names the KC "tr1.ghost", which is not in content/kc/graph.yaml')
  })

  test('the problems come in the order of the files and then the lines', () => {
    const many = graphOf(kc('tr1.b'), kc('tr1.a', { planned: 'W1-T99' }), kc('tr1.c', { requires: '[ks:t5.nope]', ...PLANNED }))
    const result = run(many, {
      tasks: new Set(['W1-T14']),
      kernelspace: { commit: 'a'.repeat(40), source: '', ids: [] },
      references: [item('item:gen/tr1.q', [])],
    })
    expect(result.diagnostics.map((d) => [d.file, d.line, d.code])).toEqual([
      [GRAPH, 1, 'no-reference'],
      [GRAPH, lineOf(many, 'W1-T99'), 'unknown-task'],
      [GRAPH, lineOf(many, 'ks:t5.nope'), 'unknown-ks-kc'],
      ['packages/play/items/x.ts', 1, 'reference-no-kc'],
    ])
  })
})

describe('gameReferences', () => {
  const level = (id: string, graded: boolean) => ({ id, title: id, graded, practiceSeed: 1 })
  const game = (id: string, kcs: string[], levels: ReturnType<typeof level>[]) => ({ id, kcs, levels }) as unknown as GameEntry

  test('are the registry\'s games, graded when one of their levels is', () => {
    expect(gameReferences([game('loop', ['tr2.a'], [level('first', false)]), game('pool', ['tr5a.b', 'tr5a.c'], [level('one', false), level('manager', true)])])).toEqual([
      { kind: 'level', name: 'play:loop', file: 'packages/play/registry.ts', kcs: ['tr2.a'], graded: false },
      { kind: 'level', name: 'play:pool', file: 'packages/play/registry.ts', kcs: ['tr5a.b', 'tr5a.c'], graded: true },
    ])
  })
})

describe('dependentCounts', () => {
  test('counts the KCs that lean on each, once each, whatever the route', () => {
    const parse = (text: string) => kcGraphSchema.parse(loadedYaml(text))
    expect(dependentCounts(parse(graphOf(kc('tr1.a'), kc('tr1.b', { requires: '[tr1.a, ks:t5.kv-capacity]' }), kc('tr1.c', { requires: '[tr1.b, tr1.a]' }))))).toEqual(
      new Map([
        ['tr1.a', 2],
        ['tr1.b', 1],
        ['tr1.c', 0],
      ]),
    )
    expect(dependentCounts([])).toEqual(new Map())
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Item families                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('itemReferences', () => {
  const family = (id: string, kcs: string[]) => `{ id: '${id}', kcs: [${kcs.map((k) => `'${k}'`).join(', ')}], make() { return 1 }, grade() { return 1 } }`

  test('while packages/play/items does not exist, finds none and says which task builds them', async () => {
    const found = await itemReferences(tempDir())
    expect(found.references).toEqual([])
    expect(found.diagnostics).toEqual([])
    expect(found.note).toContain('W1-T04')
  })

  test('once it exists and holds no family, fails: the families are to be wired in', async () => {
    const dir = put(tempDir(), { 'packages/play/items/index.ts': 'export const Nothing = 1\n' })
    const found = await itemReferences(dir)
    expect(found.diagnostics.map((d) => [d.code, d.file])).toEqual([['no-families', 'packages/play/items']])
    expect(found.diagnostics[0].message).toContain('a kcs list and a make function')
  })

  test('reads a family alone, in an array and in a record, with the key standing in for a missing id', async () => {
    const dir = put(tempDir(), {
      'packages/play/items/one.ts': `export const bubbleWidth = ${family('tr2.bubble-width', ['tr2.bubble', 'tr2.async-overlap'])}\n`,
      'packages/play/items/many.ts': `export const FAMILIES = [${family('tr2.graph-hit', ['tr2.graph-replay'])}, { not: 'a family' }]\n`,
      'packages/play/items/deep/record.ts': `export const BY_ID = { 'tr1.request-state': { kcs: ['tr1.request-states'], make() { return 1 } } }\n`,
    })
    const found = await itemReferences(dir)
    expect(found.diagnostics).toEqual([])
    expect(found.note).toBeNull()
    // The folder is walked in name order, a folder where it stands among the files.
    expect(found.references.map((r) => [r.name, r.kcs, r.graded, r.kind, r.file])).toEqual([
      ['item:gen/tr1.request-state', ['tr1.request-states'], true, 'item', 'packages/play/items/deep/record.ts'],
      ['item:gen/tr2.graph-hit', ['tr2.graph-replay'], true, 'item', 'packages/play/items/many.ts'],
      ['item:gen/tr2.bubble-width', ['tr2.bubble', 'tr2.async-overlap'], true, 'item', 'packages/play/items/one.ts'],
    ])
  })

  test('counts a family once when two files export it, skips tests and declaration files, and reports a file that cannot be imported', async () => {
    const dir = put(tempDir(), {
      'packages/play/items/index.ts': `export { fam } from './fam.ts'\n`,
      'packages/play/items/fam.ts': `export const fam = ${family('tr2.padding-waste', ['tr2.capture-padding'])}\n`,
      'packages/play/items/fam.test.ts': `export const ignored = ${family('tr2.ignored', ['tr2.bubble'])}\n`,
      'packages/play/items/types.d.ts': `export const ignored = ${family('tr2.ignored-too', ['tr2.bubble'])}\n`,
      'packages/play/items/broken.ts': `throw new Error('boom')\n`,
    })
    const found = await itemReferences(dir)
    expect(found.references.map((r) => r.name)).toEqual(['item:gen/tr2.padding-waste'])
    expect(found.diagnostics.map((d) => [d.code, d.file, d.message])).toEqual([['item-import', 'packages/play/items/broken.ts', 'cannot be imported to read the families in it: boom']])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The kernelspace snapshot                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('readKernelspace', () => {
  const PIN = 'd478f91a0af590f03fcfd76ee73149fa70b28e51'
  const OTHER = 'e'.repeat(40)
  const snapshot = renderSnapshot(PIN, ['t0.wait-bars', 't5.kv-capacity'])
  const vendorMd = (pin: string) =>
    [
      '| Field | Value |',
      '|---|---|',
      `| Pinned commit | \`${pin}\` |`,
      '<!-- vendor-manifest:begin -->',
      '| Path | Module | SHA-256 | Licence | Note |',
      '|---|---|---|---|---|',
      '<!-- vendor-manifest:end -->',
      '<!-- vendor-references:begin -->',
      '| Path | SHA-256 | Taken from it |',
      '|---|---|---|',
      '<!-- vendor-references:end -->',
      '<!-- vendor-shims:begin -->',
      '| Shim | Restates | Declarations |',
      '|---|---|---|',
      '<!-- vendor-shims:end -->',
      '',
    ].join('\n')

  test('a tree with no snapshot reads as absent, which is an error only if the graph has a ks: edge (the command line decides)', () => {
    expect(readKernelspace(tempDir())).toEqual({ snapshot: null, absent: true, diagnostics: [] })
  })

  test('a snapshot that is not one fails with the schema\'s reasons', () => {
    const dir = put(tempDir(), { 'content/kc/kernelspace.json': '{ "commit": "abc", "ids": ["t5.b", "t5.a"], "extra": 1 }' })
    const { snapshot: read, absent, diagnostics } = readKernelspace(dir)
    expect([read, absent]).toEqual([null, false])
    expect(diagnostics.every((d) => d.code === 'ks-snapshot' && d.file === 'content/kc/kernelspace.json' && d.line === 1)).toBe(true)
    expect(diagnostics.map((d) => d.message).join('\n')).toMatch(/commit: must be a full 40-digit/)
    expect(readKernelspace(put(tempDir(), { 'content/kc/kernelspace.json': 'nope' })).diagnostics[0].message).toContain('not valid JSON')
  })

  test('a snapshot read at the pin is taken; one read at another commit fails, naming both', () => {
    const files = (pin: string) => ({ 'content/kc/kernelspace.json': snapshot, 'vendor/kernelspace/VENDOR.md': vendorMd(pin) })
    const fine = readKernelspace(put(tempDir(), files(PIN)))
    expect(fine.diagnostics).toEqual([])
    expect(fine.snapshot?.ids).toEqual(['t0.wait-bars', 't5.kv-capacity'])

    const moved = readKernelspace(put(tempDir(), files(OTHER)))
    expect(moved.snapshot).toBeNull()
    expect(moved.diagnostics.map((d) => d.code)).toEqual(['ks-pin'])
    expect(moved.diagnostics[0].message).toContain(`read at ${PIN.slice(0, 12)}, and vendor/kernelspace/VENDOR.md pins ${OTHER.slice(0, 12)}`)
  })

  test('without a VENDOR.md there is no pin to hold it to', () => {
    expect(readKernelspace(put(tempDir(), { 'content/kc/kernelspace.json': snapshot })).diagnostics).toEqual([])
  })

  test('reads the pin out of the real VENDOR.md, whose table the made-up ones above imitate', () => {
    const withReal = (commit: string) => {
      const dir = put(tempDir(), { 'content/kc/kernelspace.json': renderSnapshot(commit, ['t5.kv-capacity']) })
      mkdirSync(path.join(dir, 'vendor/kernelspace'), { recursive: true })
      copyFileSync(path.join(root, 'vendor/kernelspace/VENDOR.md'), path.join(dir, 'vendor/kernelspace/VENDOR.md'))
      return readKernelspace(dir)
    }
    expect(withReal(PIN).diagnostics).toEqual([])
    expect(withReal(OTHER).diagnostics.map((d) => d.code)).toEqual(['ks-pin'])
  })
})

describe('the files the gate reads beside the graph', () => {
  test('trackerTasks finds the tasks by their headings, and none when there is no tracker', () => {
    const dir = put(tempDir(), { 'docs/TRACKER.md': '## W1\n\n#### [ ] W1-T14 · TR2 · M · sonnet\n\n#### [x] W0-T01 · Scaffold · S\n\nW1-T99 is only mentioned.\n' })
    expect(trackerTasks(dir)).toEqual(new Set(['W1-T14', 'W0-T01']))
    expect(trackerTasks(tempDir())).toBeNull()
    expect(trackerTasks(root)?.has('W1-T03')).toBe(true)
  })

  test('courseModules reads the ids of course.yaml, and none when it is missing or is not a course', () => {
    expect(courseModules(root)?.has('tr5a')).toBe(true)
    expect(courseModules(tempDir())).toBeNull()
    expect(courseModules(put(tempDir(), { 'content/course.yaml': 'modules: nope\n' }))).toBeNull()
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The command line                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('as a process', () => {
  /**
   * The KCs that the real registry's games name, so that a tree of its own agrees with the real registry (verify:games' world). Service's
   * two stay as they were when it was the only game: the first is planned, and the second requires it and is planned. Every other game's
   * KCs join them, one entry each: a KC that a graded level earns carries nothing, and one that only practice levels reach carries
   * `planned`, as the gate asks. A game registered later is added here without this file being touched (W1-T28 registered the second).
   */
  const loopKcs = graphOf(kc('tr2.bubble', PLANNED), kc('tr2.async-overlap', { requires: '[tr2.bubble]', ...PLANNED }))
  const LOOP_IDS = ['tr2.bubble', 'tr2.async-overlap']
  const others = new Map<string, { planned: boolean }>()
  for (const game of GAMES.games) {
    if (game.id === 'loop') continue
    const earns = game.levels.some((level) => level.graded)
    // A KC is planned only while no game with a graded level names it.
    for (const id of game.kcs) if (!LOOP_IDS.includes(id)) others.set(id, { planned: !earns && (others.get(id)?.planned ?? true) })
  }
  /** A graph, and then one entry for each KC of the other games. */
  const withGames = (graph: string): string => (others.size === 0 ? graph : `${graph}\n${graphOf(...[...others].map(([id, o]) => kc(id, o.planned ? PLANNED : {})))}`)
  // The gate counts the modules in the order the graph first names them, which is the order the games register in.
  const modulesOf = (ids: Iterable<string>): string[] => [...new Set([...ids].map((id) => id.split('.')[0]))]
  /** What the gate prints of a tree that is `loopKcs` and the other games' KCs: the count, the modules, and how many are earned and planned. */
  const counted = (): string => {
    const ids = [...LOOP_IDS, ...others.keys()]
    // The gate lists the modules in the order the graph meets them, which is the order of the games in the registry.
    const byModule = [...new Set(ids.map((id) => id.split('.')[0]))].map((module) => `${module} ${ids.filter((id) => id.startsWith(`${module}.`)).length}`)
    const earned = [...others.values()].filter((o) => !o.planned).length
    const planned = LOOP_IDS.length + [...others.values()].filter((o) => o.planned).length
    return `${ids.length} KCs (${byModule.join(', ')}), 0 thresholds, 0 confusable pairs, 0 kernelspace prerequisites; ${earned} with a graded reference, ${planned} planned`
  }
  const plannedKcs = LOOP_IDS.length + [...others.values()].filter((o) => o.planned).length
  const gate = (dir: string, ...args: string[]) => {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/verify-kc.ts'), '--root', dir, ...args], { encoding: 'utf8' })
    return { status: result.status, out: result.stdout, err: result.stderr }
  }
  const tree = (graph: string, more: Record<string, string> = {}) => put(tempDir(), { 'content/kc/graph.yaml': graph, ...more })

  test('passes a graph that is fine, and prints what it counted and what it could not read yet', () => {
    const { status, out } = gate(tree(withGames(loopKcs)))
    expect(status).toBe(0)
    expect(out).toContain(`verify:kc passed: ${counted()}`)
    expect(out).toContain('note: games: loop has no graded level yet')
    expect(out).toContain('note: items: packages/play/items does not exist yet (W1-T04)')
    expect(out).toContain('note: labs: lab checks are not a source yet')
  })

  test('fails a cycle with the file and the line, and counts the errors and the files', () => {
    const graph = graphOf(kc('tr2.bubble', { requires: '[tr2.async-overlap]', ...PLANNED }), kc('tr2.async-overlap', { requires: '[tr2.bubble]', ...PLANNED }))
    const { status, out } = gate(tree(graph))
    expect(status).toBe(1)
    expect(out).toContain(`content/kc/graph.yaml:${lineOf(graph, 'requires: [tr2.bubble]')}: error schema: `)
    expect(out).toContain('requires has a cycle: tr2.bubble → tr2.async-overlap → tr2.bubble')
    expect(out).toMatch(/verify:kc failed: 1 error in 1 file\n$/)
  })

  test('holds the real registry to the graph: a game that names a KC the graph lacks fails', () => {
    const { status, out } = gate(tree(graphOf(kc('tr2.bubble', PLANNED))))
    expect(status).toBe(1)
    expect(out).toContain('packages/play/registry.ts:1: error reference-unknown-kc: play:loop names the KC "tr2.async-overlap", which is not in content/kc/graph.yaml')
  })

  test('--final fails on the placeholders that remain, and the same tree passes without it', () => {
    const dir = tree(withGames(loopKcs))
    const final = gate(dir, '--final')
    expect(final.status).toBe(1)
    expect(final.out).toContain('error planned-remaining')
    expect(final.out).toMatch(new RegExp(`verify:kc failed: ${plannedKcs} errors in 1 file\\n$`))
    expect(gate(dir).status).toBe(0)
  })

  test('reads course.yaml, the tracker and the snapshot when the tree has them', () => {
    const graph = withGames(graphOf(kc('tr2.bubble', { requires: '[ks:t5.kv-capacity]', planned: 'W1-T14' }), kc('tr2.async-overlap', { requires: '[tr2.bubble]', planned: 'W1-T99' })))
    // Course.yaml has tr1 and the modules of the other games' KCs, and not tr2: so the two errors about a module are Service's.
    const module = (id: string) => `  - id: ${id}\n    title: Module ${id}\n    hours: 10\n    hours_by_lane: { B: 10 }\n`
    const dir = tree(graph, {
      'docs/TRACKER.md': '#### [ ] W1-T14 · TR2 · M · sonnet\n',
      'content/course.yaml': `modules:\n${[...new Set(['tr1', ...modulesOf(others.keys()).filter((id) => id !== 'tr2')])].map(module).join('')}`,
      'content/kc/kernelspace.json': renderSnapshot('a'.repeat(40), ['t0.wait-bars']),
    })
    const { status, out } = gate(dir)
    expect(status).toBe(1)
    expect(out).toContain('error unknown-module: ')
    expect(out).toContain('error unknown-ks-kc: ')
    expect(out).toContain('error unknown-task: ')
    expect(out).toMatch(/verify:kc failed: 4 errors in 1 file\n$/)
  })

  test('a ks: edge with no snapshot fails, and a description that only speaks of a ks: id does not need one', () => {
    const edge = graphOf(kc('tr2.bubble', { requires: '[ks:t0.wait-bars]', ...PLANNED }), kc('tr2.async-overlap', { requires: '[tr2.bubble]', ...PLANNED }))
    const failed = gate(tree(edge))
    expect(failed.status).toBe(1)
    expect(failed.out).toContain('content/kc/kernelspace.json:1: error ks-snapshot: content/kc/kernelspace.json does not exist, and the graph has ks: edges')

    const speech = '# see ks:t0.wait-bars\n- id: tr2.bubble\n  description: You can read ks:t0.wait-bars.\n  planned: W1-T14\n\n' + kc('tr2.async-overlap', PLANNED) + '\n'
    expect(gate(tree(withGames(speech))).status).toBe(0)
  })

  test('a tree with no graph is one error, and a bad option is a usage error', () => {
    const none = gate(tempDir())
    expect(none.status).toBe(1)
    expect(none.out).toContain('content/kc/graph.yaml:1: error missing-file:')
    for (const args of [['--nope'], ['--root'], ['somewhere']]) {
      const result = spawnSync(process.execPath, [path.join(root, 'scripts/verify-kc.ts'), ...args], { encoding: 'utf8' })
      expect([args, result.status]).toEqual([args, 2])
      expect(result.stderr).toContain('usage: bun scripts/verify-kc.ts [--final] [--root <dir>]')
    }
  })
})
