/*
 * W1-T17 acceptance check 3: `verify:games` passes for `engine-floor`. The gate itself is run on this checkout; the rest hold the registry's
 * record of Back of House to what the code does and to the content it names: its claims are the card's, its KCs are in the graph, its
 * card is the lifecycle model's, and the registry costs a page that lists games none of the sim.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { load, CORE_SCHEMA } from 'js-yaml'
import { COMMON_KEYS, GAMES, keyProblems, keymapOf } from '@es/play'
import { ENGINE_FLOOR } from '@es/play/engine-floor/entry'
import { ALL_LEVEL_IDS, LEVEL_IDS, MAP_LEVEL, levelTitle } from '@es/play/engine-floor/levels'
import { floorSession } from '@es/play/engine-floor/session'
import { LIFECYCLE_CARD_ID } from '@es/sim/lifecycle'
import { GAME_COMPONENTS, resolveGame } from '@/games/registry'
import { checkGames, filesAt, worldAt } from '../../scripts/verify-games'

// The gate measures every registered game's band on four hundred seeds a level, and the Reach-In's nights are simulations: it takes seconds, and several on a loaded host.
setDefaultTimeout(120_000)

const root = path.resolve(import.meta.dirname, '../..')

/** The ids in every claims file under content/claims, at any depth, as the content compiler reads them. */
function claimIds(dir = path.join(root, 'content/claims')): Set<string> {
  const ids = new Set<string>()
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) for (const id of claimIds(full)) ids.add(id)
    else if (/\.ya?ml$/.test(entry.name)) for (const item of (load(readFileSync(full, 'utf8'), { schema: CORE_SCHEMA }) as { id?: string }[]) ?? []) if (typeof item?.id === 'string') ids.add(item.id)
  }
  return ids
}

describe('verify:games for engine-floor', () => {
  test('the gate has nothing to say about Back of House on this checkout: its files, its card, its keys, its claims, its KCs and its session', async () => {
    const report = await checkGames({ games: GAMES.games, componentIds: Object.keys(GAME_COMPONENTS), files: filesAt(root), world: worldAt(root) })
    expect(report.findings).toEqual([])
    expect(report.notes).toEqual([])
    const lines = report.lines.get('engine-floor') ?? []
    expect(lines[0]).toBe("Back of House · a request's lifecycle")
    for (const id of ALL_LEVEL_IDS) expect(lines.some((line) => line.startsWith(`${id}: practice seed 0 in band; `))).toBe(true)
    expect(lines).toContain('keys: 8 common + 2 of its own')
  })

  test('`bun scripts/verify-games.ts` prints the measured acceptance of each band, for each game, and passes', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-games.ts'], { cwd: root, encoding: 'utf8' })
    expect(result.status).toBe(0)
    // The count is the registry's, so that a game registered later does not break this file.
    const games = GAMES.games.length
    expect(result.stdout).toContain(`verify-games: ${games} game${games === 1 ? '' : 's'} registered, ${games} component${games === 1 ? '' : 's'}`)
    expect(result.stdout).toMatch(/nano: practice seed 0 in band; \d+% of the first 400 seeds in band \(floor 20%\)/)
    expect(result.stdout).toMatch(/abort: practice seed 0 in band; \d+% of the first 400 seeds in band \(floor 20%\)/)
    expect(result.stdout).toContain('verify-games: ok')
  })
})

describe('the registry\'s record of Back of House', () => {
  test('is D-049\'s: the display name over its subtitle, the id `engine-floor`, TR1, and no 3D scene yet (W1-T18 builds it and turns `has3d` on)', () => {
    expect([ENGINE_FLOOR.id, ENGINE_FLOOR.title, ENGINE_FLOOR.subtitle]).toEqual(['engine-floor', 'Back of House', "a request's lifecycle"])
    expect(ENGINE_FLOOR.modules).toEqual(['tr1'])
    expect(ENGINE_FLOOR.has3d).toBe(false)
    expect(existsSync(path.join(root, 'src/games/engine-floor/Scene3D.tsx'))).toBe(false)
    expect(GAMES.get('engine-floor')).toBe(ENGINE_FLOOR)
    expect(GAMES.games.filter((game) => game.id === 'engine-floor')).toHaveLength(1)
  })

  test('has its levels in GAMES.md\'s order with their titles, the seven practice levels and then the graded `map`, each on a pinned seed that is the first the band accepts', () => {
    expect(ENGINE_FLOOR.levels.map((level) => level.id)).toEqual([...LEVEL_IDS, MAP_LEVEL])
    expect(ENGINE_FLOOR.levels.map((level) => level.title)).toEqual(ALL_LEVEL_IDS.map((id) => levelTitle(id)))
    expect(ENGINE_FLOOR.levels.filter((level) => level.graded).map((level) => level.id)).toEqual(['map'])
    for (const level of ENGINE_FLOOR.levels) {
      const first = Array.from({ length: 50 }, (_, seed) => seed).find((seed) => floorSession.inBand(level.id, seed))
      expect([level.id, level.practiceSeed]).toEqual([level.id, first])
    }
  })

  test('has two keys of its own, R to run and Backspace to take the last stage off, that take nothing the common keys have (GAMES.md §5, "Controls")', () => {
    expect(ENGINE_FLOOR.keys.map((key) => [key.id, key.code, key.label])).toEqual([
      ['run', 'KeyR', 'R'],
      ['unlay', 'Backspace', 'Backspace'],
    ])
    expect(keyProblems(ENGINE_FLOOR.keys)).toEqual([])
    expect(keymapOf(ENGINE_FLOOR).length).toBe(COMMON_KEYS.length + 2)
  })

  test('names the lifecycle model\'s card, which exists, and cites the claims that card cites and no others', () => {
    expect(ENGINE_FLOOR.card).toBe(LIFECYCLE_CARD_ID)
    const card = readFileSync(path.join(root, 'content/cards', `${ENGINE_FLOOR.card}.md`), 'utf8')
    const cited = new Set([...card.matchAll(/\{\{claim:([^}]+)\}\}/g)].map((match) => match[1]))
    expect(cited.size).toBeGreaterThan(20)
    expect(new Set(ENGINE_FLOOR.claims)).toEqual(cited)
    expect(new Set(ENGINE_FLOOR.claims).size).toBe(ENGINE_FLOOR.claims.length)
  })

  test('names KCs that are in the KC graph and claims that are in content/claims, wherever its folder', () => {
    const graph = load(readFileSync(path.join(root, 'content/kc/graph.yaml'), 'utf8'), { schema: CORE_SCHEMA }) as { id: string }[]
    const ids = new Set(graph.map((kc) => kc.id))
    expect(ENGINE_FLOOR.kcs).toEqual(['tr1.five-mechanisms', 'tr1.small-engine-anatomy', 'tr1.vllm-lifecycle', 'tr1.sglang-lifecycle', 'tr1.abort-path'])
    for (const kc of ENGINE_FLOOR.kcs) expect([kc, ids.has(kc)]).toEqual([kc, true])
    const have = claimIds()
    for (const id of ENGINE_FLOOR.claims) expect([id, have.has(id)]).toEqual([id, true])
  })

  test('costs a page that lists the games none of the sim: the entry reaches the session only through import()', () => {
    const source = readFileSync(path.join(root, 'packages/play/engine-floor/entry.ts'), 'utf8')
    expect(source).not.toMatch(/from '\.\/(session|levels|engine|layout|stages|facts)'/)
    expect(source).not.toMatch(/@es\/sim/)
    expect(source.match(/import\('\.\/session'\)/g)).toHaveLength(1)
    const registry = readFileSync(path.join(root, 'packages/play/registry.ts'), 'utf8')
    expect(registry).toContain("from './engine-floor/entry'")
    expect(registry).not.toMatch(/from '\.\/engine-floor\/(session|levels|engine|layout|stages|facts)'/)
  })

  test('loads its session on demand, and the session is the one the page plays; the component registry resolves it and refuses a name that is not a game', async () => {
    expect(await ENGINE_FLOOR.session()).toBe(floorSession)
    const found = resolveGame('engine-floor')
    expect(found.kind).toBe('game')
    expect(resolveGame('constructor').kind).toBe('unknown')
    // Every game of the registry has its component, and no component stands without a game.
    expect(Object.keys(GAME_COMPONENTS).sort()).toEqual(GAMES.games.map((game) => game.id).sort())
  })
})
