/*
 * W1-T23 acceptance check 3: `verify:games` passes for `pool`. The gate itself is run on this checkout; the rest hold the registry's record
 * of The Reach-In to what the code does and to the content it names: its claims are in content/claims (in the folders that W1-T01 sorted
 * them into), its KCs are in the graph and earned by a graded level, its card is the hybrid KV manager's, its 3D scene is not built yet
 * (W1-T24), and the registry costs a page that lists games none of the sim.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { load, CORE_SCHEMA } from 'js-yaml'
import { COMMON_KEYS, GAMES, keyProblems, keymapOf } from '@es/play'
import { POOL } from '@es/play/pool/entry'
import { poolSession } from '@es/play/pool/session'
import { GAME_COMPONENTS } from '@/games/registry'
import { checkEntry, checkFiles, checkGames, filesAt, worldAt } from '../../scripts/verify-games'
import { ROSTER } from '@es/play/roster'

// The gate measures every registered game's band on four hundred seeds a level, and the Reach-In's nights are simulations: it takes seconds, and several on a loaded host.
setDefaultTimeout(120_000)

const root = path.resolve(import.meta.dirname, '../..')

/** Every claim id under content/claims, in its folders. */
function claimIds(): Set<string> {
  const ids = new Set<string>()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = path.join(dir, entry)
      if (/\.ya?ml$/.test(entry)) for (const item of (load(readFileSync(full, 'utf8'), { schema: CORE_SCHEMA }) as { id: string }[]) ?? []) ids.add(item.id)
      else if (!entry.includes('.')) walk(full)
    }
  }
  walk(path.join(root, 'content/claims'))
  return ids
}

describe('verify:games for pool', () => {
  test('the gate has nothing to say about The Reach-In on this checkout: its files, its card, its keys, its claims, its KCs and its session', async () => {
    const report = await checkGames({ games: GAMES.games, componentIds: Object.keys(GAME_COMPONENTS), files: filesAt(root), world: worldAt(root) })
    expect(report.findings).toEqual([])
    expect(report.notes).toEqual([])
    const lines = report.lines.get('pool') ?? []
    expect(lines[0]).toBe('The Reach-In · hybrid KV pages and adapters')
    for (const level of POOL.levels) {
      expect(lines.some((line) => line.startsWith(`${level.id}: practice seed ${level.practiceSeed} in band; `))).toBe(true)
    }
    expect(lines.filter((line) => /of the first 400 seeds in band \(floor 20%\)$/.test(line))).toHaveLength(7)
    expect(lines).toContain('keys: 8 common + 2 of its own')
  })
})

describe('the registry\'s record of The Reach-In', () => {
  test('is D-049\'s: the display name over its subtitle, the id `pool`, TR5a, and no 3D scene until W1-T24 builds it', () => {
    expect([POOL.id, POOL.title, POOL.subtitle]).toEqual(['pool', 'The Reach-In', 'hybrid KV pages and adapters'])
    expect(POOL.modules).toEqual(['tr5a'])
    expect(POOL.has3d).toBe(false)
    expect(existsSync(path.join(root, 'src/games/pool/Scene3D.tsx'))).toBe(false)
    expect(GAMES.get('pool')).toBe(POOL)
    expect(Object.keys(GAME_COMPONENTS)).toContain('pool')
    // The two registries list the same games, whichever others are in them (verify:games fails when they do not).
    expect(Object.keys(GAME_COMPONENTS).sort()).toEqual(GAMES.games.map((game) => game.id).sort())
    // The roster of the course's nine games holds the same name and modules.
    const row = ROSTER.find((entry) => entry.id === 'pool')
    expect([row?.title, row?.subtitle, row?.modules]).toEqual([POOL.title, POOL.subtitle, POOL.modules])
  })

  test('has two keys of its own, `W` to hang none and `D` to dump the pans chosen, that take nothing the common keys have (GAMES.md §3, "Controls")', () => {
    expect(POOL.keys.map((key) => [key.id, key.code, key.label])).toEqual([['wait', 'KeyW', 'W'], ['dump', 'KeyD', 'D']])
    expect(keyProblems(POOL.keys)).toEqual([])
    expect(keymapOf(POOL).length).toBe(COMMON_KEYS.length + 2)
  })

  test('names the hybrid KV manager\'s card, which exists and says its numbers are synthetic', () => {
    expect(POOL.card).toBe('kv')
    const card = readFileSync(path.join(root, 'content/cards', `${POOL.card}.md`), 'utf8')
    expect(card).toContain('The Reach-In')
    expect(card).toContain('synthetic')
  })

  test('names KCs that are in the KC graph, each earned by the graded `manager` level, so neither carries a plan any more', () => {
    const text = readFileSync(path.join(root, 'content/kc/graph.yaml'), 'utf8')
    const graph = load(text, { schema: CORE_SCHEMA }) as { id: string; planned?: string }[]
    for (const id of POOL.kcs) {
      const kc = graph.find((entry) => entry.id === id)
      expect([id, kc !== undefined]).toEqual([id, true])
      expect([id, kc?.planned]).toEqual([id, undefined])
    }
    expect(POOL.kcs).toEqual(['tr5a.kv-groups', 'tr5a.page-size-unification'])
    expect(POOL.levels.some((level) => level.graded)).toBe(true)
    expect(text).not.toContain('W1-T23')
  })

  test('cites claims that are in content/claims, each a fact of the pinned engines or of the design that the page prints', () => {
    const have = claimIds()
    expect(POOL.claims.length).toBeGreaterThan(10)
    for (const id of POOL.claims) expect([id, have.has(id)]).toEqual([id, true])
    expect(new Set(POOL.claims).size).toBe(POOL.claims.length)
  })

  test('costs a page that lists the games none of the sim: the entry reaches the session only through import()', () => {
    const source = readFileSync(path.join(root, 'packages/play/pool/entry.ts'), 'utf8')
    expect(source).not.toMatch(/from '\.\/(session|levels|engine|manager|policy|bands|view|score|labels|debrief|workload)'/)
    expect(source).not.toMatch(/@es\/sim/)
    expect(source.match(/import\('\.\/session'\)/g)).toHaveLength(1)
    const registry = readFileSync(path.join(root, 'packages/play/registry.ts'), 'utf8')
    expect(registry).toContain("from './pool/entry'")
    expect(registry).not.toMatch(/from '\.\/pool\/(session|levels|engine|manager|policy|bands|view|score|labels|debrief|workload)'/)
  })

  test('loads its session on demand, and the session is the one the page plays', async () => {
    expect(await POOL.session()).toBe(poolSession)
  })

  test('the entry and the files pass the gate\'s own checks, one by one', () => {
    expect(checkEntry(POOL)).toEqual([])
    expect(checkFiles(POOL, filesAt(root))).toEqual([])
  })

  test('Game.tsx never imports a 3D scene, and does render the four parts the gate looks for', () => {
    const game = readFileSync(path.join(root, 'src/games/pool/Game.tsx'), 'utf8')
    expect(game).not.toMatch(/Scene3D/)
    for (const part of ['View2D', 'Mirror', 'Debrief', 'Controls']) expect(game).toContain(`<${part}`)
  })
})
