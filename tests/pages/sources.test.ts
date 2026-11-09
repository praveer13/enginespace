/*
 * scripts/pages/sources.ts: what fills the route table's parameters in this checkout (ARCHITECTURE §3.2, W0-T19).
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { GAMES } from '../../packages/play'
import { GAME_IDS, LAB_IDS } from '../../scripts/content/directives'
import { loadIndex, loadSources, SourcesError, TRACE_IDS } from '../../scripts/pages/sources'
import { read } from '../ci/support'

describe('loadSources', () => {
  const sources = loadSources()

  test('reads the course index in memory, with every module of course.yaml and the lessons that are written', () => {
    const course = read('content/course.yaml')
    const listed = [...course.matchAll(/^ {2}- id: (\S+)/gm)].map((match) => match[1])
    expect(listed.length).toBeGreaterThan(10)
    expect(sources.index.modules.map((module) => module.id)).toEqual(listed)
    expect(sources.index.modules.every((module) => module.route === `/m/${module.id}`)).toBe(true)
    expect(sources.index.modules.flatMap((module) => module.lessons).length).toBeGreaterThan(0)
  })

  test('reads the games from the registry, and the labs from the lab list of the content compiler', () => {
    expect(sources.games).toBe(GAMES.games)
    expect(sources.labs).toBe(LAB_IDS)
    // Every game of the registry is a game of the roster (ARCHITECTURE §6.1), though the roster has more than the registry yet.
    expect(sources.games.filter((game) => !GAME_IDS.includes(game.id))).toEqual([])
  })

  test('takes the traces from TRACE_IDS, each a plain id that can name a folder', () => {
    expect(sources.traces).toBe(TRACE_IDS)
    for (const trace of TRACE_IDS) expect(trace).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  })
})

describe('loadIndex', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-sources-'))
  afterAll(() => rmSync(scratch, { recursive: true, force: true }))

  test('throws a SourcesError that names the file when the content cannot be compiled', () => {
    let error: unknown
    try {
      loadIndex(scratch)
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(SourcesError)
    expect((error as Error).message).toContain('so there is no course index')
    expect((error as Error).message).toContain('content/course.yaml')
  })
})
