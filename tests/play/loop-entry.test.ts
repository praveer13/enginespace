/*
 * W0-T16 acceptance check 5: `verify:games` passes for `loop`. The gate itself is run on this checkout; the rest hold the registry's
 * record of Service to what the code does and to the content it names: its claims are the tick card's numbers, its KCs are in the
 * graph, its card is the step-loop model's, and the registry costs a page that lists games none of the sim.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { load, CORE_SCHEMA } from 'js-yaml'
import { COMMON_KEYS, GAMES, keyProblems, keymapOf } from '@es/play'
import { LOOP } from '@es/play/loop/entry'
import { SLOTS } from '@es/play/loop/levels'
import { TICK_CARD, STEPLOOP_CARD_ID } from '@es/sim/steploop'
import { claimsFileSchema } from '@es/schema/claims'
import { GAME_COMPONENTS } from '@/games/registry'
import { checkGames, filesAt, worldAt } from '../../scripts/verify-games'

const root = path.resolve(import.meta.dirname, '../..')
const claims = claimsFileSchema.parse(load(readFileSync(path.join(root, 'content/claims/loop.yaml'), 'utf8'), { schema: CORE_SCHEMA }))
const claim = (id: string) => {
  const found = claims.find((candidate) => candidate.id === id)
  if (found === undefined) throw new Error(`no claim ${id}`)
  return found
}

describe('verify:games for loop', () => {
  test('the gate has nothing to say about Service on this checkout: its files, its card, its keys, its claims, its KCs and its session', async () => {
    const report = await checkGames({ games: GAMES.games, componentIds: Object.keys(GAME_COMPONENTS), files: filesAt(root), world: worldAt(root) })
    expect(report.findings).toEqual([])
    expect(report.notes).toEqual([])
    const lines = report.lines.get('loop') ?? []
    expect(lines[0]).toBe('Service · the step loop')
    for (const id of ['first-1-fill', 'first-2-slot', 'first-3-gap', 'first-4-par']) expect(lines.some((line) => line.startsWith(`${id}: practice seed 1 in band; `))).toBe(true)
    expect(lines).toContain('keys: 8 common + 1 of its own')
  })

  test('`bun scripts/verify-games.ts` prints the measured acceptance of each band and passes', () => {
    const result = spawnSync(process.execPath, ['scripts/verify-games.ts'], { cwd: root, encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('verify-games: 1 game registered, 1 component')
    expect(result.stdout).toMatch(/first-4-par: practice seed 1 in band; \d+% of the first 400 seeds in band \(floor 20%\)/)
    expect(result.stdout).toContain('verify-games: ok')
  })
})

describe('the registry\'s record of Service', () => {
  test('is D-049\'s: the display name over its subtitle, the id `loop`, TR2 first and TR6 after it, and its 3D scene (W0-T17)', () => {
    expect([LOOP.id, LOOP.title, LOOP.subtitle]).toEqual(['loop', 'Service', 'the step loop'])
    expect(LOOP.modules).toEqual(['tr2', 'tr6'])
    expect(LOOP.has3d).toBe(true)
    expect(existsSync(path.join(root, 'src/games/loop/Scene3D.tsx'))).toBe(true)
    expect(GAMES.get('loop')).toBe(LOOP)
    expect(Object.keys(GAME_COMPONENTS)).toEqual(['loop'])
  })

  test('has one key of its own, `O` for overlap, that takes nothing the common keys have (GAMES.md §3, "Controls")', () => {
    expect(LOOP.keys.map((key) => [key.id, key.code, key.label])).toEqual([['overlap', 'KeyO', 'O']])
    expect(keyProblems(LOOP.keys)).toEqual([])
    expect(keymapOf(LOOP).length).toBe(COMMON_KEYS.length + 1)
  })

  test('names the step-loop model\'s card, which exists and speaks of the tick card (A§5.9, D-048)', () => {
    expect(LOOP.card).toBe(STEPLOOP_CARD_ID)
    const card = readFileSync(path.join(root, 'content/cards', `${LOOP.card}.md`), 'utf8')
    expect(card).toContain('tick card')
    expect(card).toContain('synthetic')
  })

  test('names KCs that are in the KC graph and claims that are in content/claims', () => {
    const graph = load(readFileSync(path.join(root, 'content/kc/graph.yaml'), 'utf8'), { schema: CORE_SCHEMA }) as { id: string }[]
    const ids = new Set(graph.map((kc) => kc.id))
    for (const kc of LOOP.kcs) expect([kc, ids.has(kc)]).toEqual([kc, true])
    const have = new Set(claims.map((c) => c.id))
    for (const id of LOOP.claims) expect([id, have.has(id)]).toEqual([id, true])
    expect(LOOP.claims.filter((id) => id.startsWith('loop.')).sort()).toEqual(claims.map((c) => c.id).sort())
  })

  test('costs a page that lists the games none of the sim: the entry reaches the session only through import()', () => {
    const source = readFileSync(path.join(root, 'packages/play/loop/entry.ts'), 'utf8')
    expect(source).not.toMatch(/from '\.\/(session|levels|engine|layout)'/)
    expect(source).not.toMatch(/@es\/sim/)
    expect(source.match(/import\('\.\/session'\)/g)).toHaveLength(1)
    const registry = readFileSync(path.join(root, 'packages/play/registry.ts'), 'utf8')
    expect(registry).toContain("from './loop/entry'")
    expect(registry).not.toMatch(/from '\.\/loop\/(session|levels|engine|layout)'/)
  })

  test('loads its session on demand, and the session is the one the page plays', async () => {
    const session = await LOOP.session()
    const { loopSession } = await import('@es/play/loop/session')
    expect(session).toBe(loopSession)
  })
})

describe('the claims Service shows are its world\'s numbers', () => {
  test('the synthetic ones are the tick card\'s: 2 ticks to plan, 4 to cook, 1 more on an admission, 1 to read, and 4 clips', () => {
    expect([claim('loop.world.plan-ticks').value, TICK_CARD.scheduleBaseUs]).toEqual([2, 2])
    expect([claim('loop.world.forward-ticks').value, TICK_CARD.forwardUs]).toEqual([4, 4])
    expect([claim('loop.world.admit-ticks').value, TICK_CARD.admitUs]).toEqual([1, 1])
    expect([claim('loop.world.read-ticks').value, TICK_CARD.syncUs]).toEqual([1, 1])
    expect([claim('loop.world.clips').value, SLOTS]).toEqual([4, 4])
    for (const id of ['plan', 'forward', 'admit', 'read']) {
      const c = claim(`loop.world.${id}-ticks`)
      expect([c.synthetic, c.tag, c.unit]).toEqual([true, 'estimated', 'ticks'])
    }
  })

  test('a step is 7 ticks without overlap and 4 with it, which the claims derive and the card\'s costs add up to', () => {
    expect(claim('loop.world.step-ticks-serial').value).toBe(TICK_CARD.scheduleBaseUs + TICK_CARD.forwardUs + TICK_CARD.syncUs)
    expect(claim('loop.world.step-ticks-overlap').value).toBe(Math.max(TICK_CARD.forwardUs, TICK_CARD.scheduleBaseUs + TICK_CARD.syncUs))
    expect(claim('loop.world.step-ticks-serial').tag).toBe('derived')
  })

  test('the real anchor is two measured rows with the source\'s own words and the ratios derived from them, as the end card prints them', () => {
    const four = claim('loop.anchor.tpot-conc-4')
    const sixtyFour = claim('loop.anchor.tpot-conc-64')
    expect([four.tag, sixtyFour.tag]).toEqual(['measured', 'measured'])
    expect([four.value, sixtyFour.value]).toEqual([11.776, 19.515])
    expect(four.source?.quote).toBe('"mean_tpot":0.011776147370379336')
    expect(sixtyFour.source?.quote).toBe('"mean_tpot":0.01951460483344175')
    expect(four.source?.accessed).toBe('2026-11-04')
    // The seconds in the quote are the milliseconds of the claim, to its three decimals.
    expect(Math.round(0.011776147370379336 * 1000 * 1000) / 1000).toBe(four.value as number)
    expect(Math.round(0.01951460483344175 * 1000 * 1000) / 1000).toBe(sixtyFour.value as number)
    expect(claim('loop.anchor.tpot-ratio').value).toBe(1.66)
    expect(claim('loop.anchor.tput-ratio').value).toBe(9.7)
    // What the Debrief prints is these values, rounded as the end card says: 11.8 ms, 19.5 ms, 1.66 times and 9.7 times.
    expect([Math.round((four.value as number) * 10) / 10, Math.round((sixtyFour.value as number) * 10) / 10]).toEqual([11.8, 19.5])
    const debrief = readFileSync(path.join(root, 'src/games/loop/Debrief.tsx'), 'utf8')
    for (const shown of ['11.8', '19.5', '1.66', '9.7']) expect(debrief).toContain(shown)
  })
})
