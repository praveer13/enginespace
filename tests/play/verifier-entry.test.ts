/*
 * W1-T28 acceptance check 3: `verify:games` passes for `verifier`. The gate itself is run on this checkout; the rest hold the registry's
 * record of The Tasting to what the code does and to the content it names: its claims are in content/claims (in the folders that
 * W1-T01 sorted them into), its KCs are in the graph, its card is the speculation model's, its 3D scene (W1-T29) is a lazy chunk, and the
 * registry costs a page that lists games none of the sim.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { load, CORE_SCHEMA } from 'js-yaml'
import { COMMON_KEYS, GAMES, keyProblems, keymapOf } from '@es/play'
import { VERIFIER } from '@es/play/verifier/entry'
import { verifierSession } from '@es/play/verifier/session'
import { SPEC_CARD_ID } from '@es/sim/spec'
import { GAME_COMPONENTS } from '@/games/registry'
import { checkEntry, checkFiles, checkGames, filesAt, worldAt } from '../../scripts/verify-games'

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

describe('verify:games for verifier', () => {
  test('the gate has nothing to say about The Tasting on this checkout: its files, its card, its keys, its claims, its KCs and its session', async () => {
    const report = await checkGames({ games: GAMES.games, componentIds: Object.keys(GAME_COMPONENTS), files: filesAt(root), world: worldAt(root) })
    expect(report.findings).toEqual([])
    expect(report.notes).toEqual([])
    const lines = report.lines.get('verifier') ?? []
    expect(lines[0]).toBe("The Tasting · speculative decoding's verifier")
    for (const [id, seed] of [['overlap', 0], ['exact', 0], ['chain', 1], ['greedy-ngram', 0], ['mutants', 0], ['gamma', 0]]) {
      expect(lines.some((line) => line.startsWith(`${id}: practice seed ${seed} in band; `))).toBe(true)
    }
    expect(lines).toContain('keys: 8 common + 2 of its own')
  })

  test('`bun scripts/verify-games.ts` prints the measured acceptance of each band and passes', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-games.ts'], { cwd: root, encoding: 'utf8' })
    expect(result.status).toBe(0)
    const games = GAMES.games.length
    expect(result.stdout).toContain(`verify-games: ${games} games registered, ${games} components`)
    expect(result.stdout).toContain('  verifier\n    The Tasting')
    expect(result.stdout).toMatch(/chain: practice seed 1 in band; \d+% of the first 400 seeds in band \(floor 20%\)/)
    expect(result.stdout).toContain('verify-games: ok')
  })

  test('`worldAt` reads the claims in their folders, as the content compiler does, and not only the files at the top', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'es-verifier-world-'))
    mkdirSync(path.join(dir, 'content/claims/vllm'), { recursive: true })
    writeFileSync(path.join(dir, 'content/claims/top.yaml'), '- id: top.one\n  value: 1\n')
    writeFileSync(path.join(dir, 'content/claims/vllm/spec.yaml'), '- id: vllm.spec.one\n  value: 1\n- id: vllm.spec.two\n  value: 2\n')
    expect([...(worldAt(dir).claimIds ?? [])].sort()).toEqual(['top.one', 'vllm.spec.one', 'vllm.spec.two'])
  })
})

describe('the registry\'s record of The Tasting', () => {
  test('is D-049\'s: the display name over its subtitle, the id `verifier`, TR6, and the 3D scene W1-T29 built', () => {
    expect([VERIFIER.id, VERIFIER.title, VERIFIER.subtitle]).toEqual(['verifier', 'The Tasting', "speculative decoding's verifier"])
    expect(VERIFIER.modules).toEqual(['tr6'])
    expect(VERIFIER.has3d).toBe(true)
    expect(existsSync(path.join(root, 'src/games/verifier/Scene3D.tsx'))).toBe(true)
    expect(GAMES.get('verifier')).toBe(VERIFIER)
    expect(GAMES.games.map((game) => game.id)).toContain('verifier')
    expect(Object.keys(GAME_COMPONENTS)).toContain('verifier')
    // The two registries list the same games, whichever others are in them (verify:games fails when they do not).
    expect(Object.keys(GAME_COMPONENTS).sort()).toEqual(GAMES.games.map((game) => game.id).sort())
  })

  test('has two keys of its own, `D` to draw a batch and Enter to submit, that take nothing the common keys have (GAMES.md §10, "Controls")', () => {
    expect(VERIFIER.keys.map((key) => [key.id, key.code, key.label])).toEqual([['draw', 'KeyD', 'D'], ['submit', 'Enter', 'Enter']])
    expect(keyProblems(VERIFIER.keys)).toEqual([])
    expect(keymapOf(VERIFIER).length).toBe(COMMON_KEYS.length + 2)
  })

  test('names the speculation model\'s card, which exists and says its numbers are synthetic and its bugs are the bestiary\'s (A§5.9)', () => {
    expect(VERIFIER.card).toBe(SPEC_CARD_ID)
    const card = readFileSync(path.join(root, 'content/cards', `${VERIFIER.card}.md`), 'utf8')
    expect(card).toContain('The Tasting')
    expect(card).toContain('synthetic')
  })

  test('names KCs that are in the KC graph, and each of them is one that a graded level earns', () => {
    const graph = load(readFileSync(path.join(root, 'content/kc/graph.yaml'), 'utf8'), { schema: CORE_SCHEMA }) as { id: string }[]
    const ids = new Set(graph.map((kc) => kc.id))
    for (const kc of VERIFIER.kcs) expect([kc, ids.has(kc)]).toEqual([kc, true])
    expect(VERIFIER.kcs).toEqual(['tr6.exact-acceptance', 'tr6.residual-recovery', 'tr6.acceptance-length'])
    expect(VERIFIER.levels.some((level) => level.graded)).toBe(true)
  })

  test('cites claims that are in content/claims, each one a fact of the pinned engines or of the paper that the page prints', () => {
    const have = claimIds()
    for (const id of VERIFIER.claims) expect([id, have.has(id)]).toEqual([id, true])
    const shown = readFileSync(path.join(root, 'src/games/verifier/Debrief.tsx'), 'utf8') + readFileSync(path.join(root, 'src/games/verifier/Card.tsx'), 'utf8')
    for (const id of ['spec.paper.accept-or-resample', 'spec.paper.expected-tokens', 'vllm.spec.rejection-sampler.exact', 'vllm.spec.bonus-token', 'sglang.spec.pr-35798']) {
      expect([id, shown.includes(id)]).toEqual([id, true])
      expect([id, VERIFIER.claims.includes(id)]).toEqual([id, true])
    }
  })

  test('costs a page that lists the games none of the sim: the entry reaches the session only through import()', () => {
    const source = readFileSync(path.join(root, 'packages/play/verifier/entry.ts'), 'utf8')
    expect(source).not.toMatch(/from '\.\/(session|levels|exact|draws|layout|state|view|facts|cards|gamma)'/)
    expect(source).not.toMatch(/@es\/sim/)
    expect(source.match(/import\('\.\/session'\)/g)).toHaveLength(1)
    const registry = readFileSync(path.join(root, 'packages/play/registry.ts'), 'utf8')
    expect(registry).toContain("from './verifier/entry'")
    expect(registry).not.toMatch(/from '\.\/verifier\/(session|levels|exact|draws|layout|state|view|facts|cards|gamma)'/)
  })

  test('loads its session on demand, and the session is the one the page plays', async () => {
    expect(await VERIFIER.session()).toBe(verifierSession)
  })

  test('the entry and the files pass the gate\'s own checks, one by one', () => {
    expect(checkEntry(VERIFIER)).toEqual([])
    expect(checkFiles(VERIFIER, filesAt(root))).toEqual([])
  })

  test('Game.tsx loads its 3D scene only through import(), so the scene is its own chunk, and renders the parts the gate looks for', () => {
    const game = readFileSync(path.join(root, 'src/games/verifier/Game.tsx'), 'utf8')
    expect(game).toContain("lazy(() => import('./Scene3D'))")
    expect(game).not.toMatch(/^import (?!type )[^\n]*from '\.\/Scene3D'/m)
    for (const part of ['View2D', 'Mirror', 'Debrief', 'Controls', 'Scene3D']) expect(game).toContain(`<${part}`)
  })
})
