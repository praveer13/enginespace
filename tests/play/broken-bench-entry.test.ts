/*
 * W1-T33 acceptance check 3: `verify:games` passes for `broken-bench`. The gate itself is run on this checkout, for The Inspection alone (the
 * whole registry is run by verifier-entry.test.ts and by `bun scripts/verify.ts games`); the rest hold the registry's record of the game to
 * what the code does and to the content it names: its practice seeds are the first in band and deal the flaw each level teaches, its claims
 * are in content/claims and are the ones the debrief cites, its KCs are in the graph, its card is the benchmark model's, its 3D opener is
 * not built yet, and the registry costs a page that lists games none of the sim.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { load, CORE_SCHEMA } from 'js-yaml'
import { COMMON_KEYS, GAMES, keyProblems, keymapOf } from '@es/play'
import { BROKEN_BENCH } from '@es/play/broken-bench/entry'
import { buildLevel, casesOf, levelTitle } from '@es/play/broken-bench/levels'
import { benchInBand, benchSession } from '@es/play/broken-bench/session'
import { LEVEL_IDS } from '@es/play/broken-bench/types'
import { FLAW_CLAIMS } from '@es/sim/bench/broken'
import { BENCH_FLAWS } from '@es/sim/bench/broken-types'
import { GAME_COMPONENTS } from '@/games/registry'
import { checkEntry, checkFiles, checkGames, filesAt, worldAt } from '../../scripts/verify-games'

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

describe('verify:games for broken-bench', () => {
  test('the gate has nothing to say about The Inspection on this checkout: its files, its card, its keys, its claims, its KCs and its session', async () => {
    const report = await checkGames({ games: [BROKEN_BENCH], componentIds: ['broken-bench'], files: filesAt(root), world: worldAt(root) })
    expect(report.findings).toEqual([])
    expect(report.notes).toEqual([])
    const lines = report.lines.get('broken-bench') ?? []
    expect(lines[0]).toBe('The Inspection · benchmark methodology')
    for (const id of LEVEL_IDS) expect([id, lines.some((line) => line.startsWith(`${id}: practice seed 0 in band; `))]).toEqual([id, true])
    expect(lines).toContain('keys: 8 common + 3 of its own')
  })

  test('the real registry lists the game, with a component, beside the others and without a second copy', () => {
    expect(GAMES.get('broken-bench')).toBe(BROKEN_BENCH)
    expect(GAMES.games.filter((game) => game.id === 'broken-bench')).toHaveLength(1)
    expect(Object.keys(GAME_COMPONENTS)).toContain('broken-bench')
    expect(Object.keys(GAME_COMPONENTS).sort()).toEqual(GAMES.games.map((game) => game.id).sort())
  })
})

describe('the registry\'s record of The Inspection', () => {
  test('is D-049\'s: the display name over its subtitle, the id `broken-bench`, TR8, and no 3D scene until the opener is built', () => {
    expect([BROKEN_BENCH.id, BROKEN_BENCH.title, BROKEN_BENCH.subtitle]).toEqual(['broken-bench', 'The Inspection', 'benchmark methodology'])
    expect(BROKEN_BENCH.modules).toEqual(['tr8'])
    expect(BROKEN_BENCH.has3d).toBe(false)
    expect(existsSync(path.join(root, 'src/games/broken-bench/Scene3D.tsx'))).toBe(false)
  })

  test('has three keys of its own, T for the stopwatch and J and K for the log, that take nothing the common keys have (GAMES.md §11, "Controls")', () => {
    expect(BROKEN_BENCH.keys.map((key) => [key.id, key.code, key.label])).toEqual([['stopwatch', 'KeyT', 'T'], ['next-row', 'KeyJ', 'J'], ['prev-row', 'KeyK', 'K']])
    expect(keyProblems(BROKEN_BENCH.keys)).toEqual([])
    expect(keymapOf(BROKEN_BENCH).length).toBe(COMMON_KEYS.length + 3)
  })

  test('has the four levels of GAMES.md §11, each graded, with the titles the levels carry and the three sheets as its stages', () => {
    expect(BROKEN_BENCH.levels.map((level) => level.id)).toEqual([...LEVEL_IDS])
    expect(BROKEN_BENCH.levels.map((level) => level.id)).toEqual(['due', 'warm', 'sure', 'court'])
    for (const level of BROKEN_BENCH.levels) {
      expect([level.id, level.title]).toEqual([level.id, levelTitle(level.id as (typeof LEVEL_IDS)[number])])
      expect(level.graded).toBe(true)
      expect(level.stages).toEqual(['rows', 'timeline', 'histogram'])
    }
  })

  test('pins each practice seed at the first seed the level\'s band accepts, which is 0 since the band is kept inside every case, and it deals the flaw the level teaches', () => {
    const teaches = { due: 'coordinated-omission', warm: 'warm-up-counted', sure: 'too-few-samples' } as const
    for (const level of BROKEN_BENCH.levels) {
      expect(level.practiceSeed).toBe(0)
      const built = buildLevel(level.id, level.practiceSeed)
      expect(benchInBand(level.id, level.practiceSeed)).toBe(true)
      expect(built.slots).toHaveLength(casesOf(level.id as (typeof LEVEL_IDS)[number]))
      if (level.id in teaches) expect(built.slots[0].flaw).toBe(teaches[level.id as keyof typeof teaches])
    }
    const court = buildLevel('court', 0).slots.map((slot) => slot.flaw)
    expect(court.some((flaw) => flaw === 'coordinated-omission' || flaw === 'client-queue-hidden')).toBe(true)
    expect(court).toContain('too-few-samples')
  })

  test('names the benchmark model\'s card, which exists and says its numbers are synthetic and which tools it models (A§5.9)', () => {
    expect(BROKEN_BENCH.card).toBe('trace-room-bench')
    const card = readFileSync(path.join(root, 'content/cards', `${BROKEN_BENCH.card}.md`), 'utf8')
    expect(card).toContain('The Inspection')
    expect(card).toContain('synthetic')
    expect(readFileSync(path.join(root, 'src/games/broken-bench/Card.tsx'), 'utf8')).toContain('trace-room-bench.md')
  })

  test('names KCs that are in the KC graph, and each of them is one that a graded level earns', () => {
    const graph = load(readFileSync(path.join(root, 'content/kc/graph.yaml'), 'utf8'), { schema: CORE_SCHEMA }) as { id: string }[]
    const ids = new Set(graph.map((kc) => kc.id))
    expect(BROKEN_BENCH.kcs).toEqual(['tr8.latency-from-due', 'tr8.open-vs-closed', 'tr8.client-queue', 'tr8.warmup-rule', 'tr8.min-n-tail', 'tr8.bootstrap-p99', 'tr8.time-shaped-replay'])
    for (const kc of BROKEN_BENCH.kcs) expect([kc, ids.has(kc)]).toEqual([kc, true])
    expect(BROKEN_BENCH.levels.some((level) => level.graded)).toBe(true)
  })

  test('cites the claims that the debrief prints: every flaw\'s instances and the flags of the real tools, each in content/claims, and no claim that nothing prints', () => {
    const have = claimIds()
    for (const id of BROKEN_BENCH.claims) expect([id, have.has(id)]).toEqual([id, true])
    const printed = new Set(BENCH_FLAWS.flatMap((flaw) => FLAW_CLAIMS[flaw]))
    for (const id of printed) expect([id, BROKEN_BENCH.claims.includes(id)]).toEqual([id, true])
    const production = readFileSync(path.join(root, 'src/games/broken-bench/Production.tsx'), 'utf8')
    const flagged = [...production.matchAll(/'((?:vllm|sglang)\.bench\.[a-z0-9.-]+)'/g)].map((match) => match[1])
    expect(flagged.length).toBeGreaterThanOrEqual(5)
    for (const id of flagged) expect([id, BROKEN_BENCH.claims.includes(id)]).toEqual([id, true])
    for (const id of BROKEN_BENCH.claims) expect([id, printed.has(id) || flagged.includes(id)]).toEqual([id, true])
    expect(new Set(BROKEN_BENCH.claims).size).toBe(BROKEN_BENCH.claims.length)
  })

  test('costs a page that lists the games none of the sim: the entry reaches the session only through import()', () => {
    const source = readFileSync(path.join(root, 'packages/play/broken-bench/entry.ts'), 'utf8')
    expect(source).not.toMatch(/from '\.\/(session|levels|cases|desk|judge|layout|flaws|logscore)'/)
    expect(source).not.toMatch(/@es\/sim/)
    expect(source.match(/import\('\.\/session'\)/g)).toHaveLength(1)
    const registry = readFileSync(path.join(root, 'packages/play/registry.ts'), 'utf8')
    expect(registry).toContain("from './broken-bench/entry'")
    expect(registry).not.toMatch(/from '\.\/broken-bench\/(session|levels|cases|desk|judge|layout|flaws|logscore)'/)
  })

  test('loads its session on demand, and the session is the one the page plays', async () => {
    expect(await BROKEN_BENCH.session()).toBe(benchSession)
  })

  test('the entry and the files pass the gate\'s own checks, one by one', () => {
    expect(checkEntry(BROKEN_BENCH)).toEqual([])
    expect(checkFiles(BROKEN_BENCH, filesAt(root))).toEqual([])
  })

  test('Game.tsx never imports a 3D scene, and does render the four parts the gate looks for', () => {
    const game = readFileSync(path.join(root, 'src/games/broken-bench/Game.tsx'), 'utf8')
    expect(game).not.toMatch(/Scene3D/)
    for (const part of ['View2D', 'Mirror', 'Debrief', 'Controls']) expect(game).toContain(`<${part}`)
  })
})
