/*
 * W2b-T28: the registry's record of Tensor views, held to what the code does and to the content it names. The game is not routed yet, so
 * the record is checked here and not by `verify:games` (W2-T14 adds it to the registry): its claims are in content/claims, its KCs are in the
 * graph, its card is the tensor card, its practice seeds draw the tensors GAMES.md §4.3 prints, and the entry reaches the session only through
 * import().
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { load, CORE_SCHEMA } from 'js-yaml'
import { COMMON_KEYS, GAMES, keyProblems } from '@es/play'
import { ROSTER } from '@es/play/roster'
import { SHAPE_SHIFTER } from '@es/play/shape-shifter/entry'
import { GRADED, GRID_PRACTICE_SEED, strideZeroShape, threeDShape, viewsShape } from '@es/play/shape-shifter/levels'
import { shiftSession } from '@es/play/shape-shifter/session'
import { SHIFT_TITLES } from '@es/play/shape-shifter/copy'
import { SHIFT_LEVEL_IDS } from '@es/play/shape-shifter/types'
import { checkEntry, checkSession } from '../../scripts/verify-games'

const root = path.resolve(import.meta.dirname, '../..')

/** The first seed from 0 for which `draws` holds. */
const firstSeed = (draws: (seed: number) => boolean): number => {
  for (let seed = 0; ; seed++) if (draws(seed)) return seed
}

describe("the registry's record of Tensor views", () => {
  test("is D-063's: the title over its subtitle, the id `shape-shifter`, TR0, and no 3D scene", () => {
    expect([SHAPE_SHIFTER.id, SHAPE_SHIFTER.title, SHAPE_SHIFTER.subtitle]).toEqual(['shape-shifter', 'Tensor views', 'A view relabels the buffer. A copy moves every element.'])
    expect(SHAPE_SHIFTER.modules).toEqual(['tr0'])
    expect(SHAPE_SHIFTER.has3d).toBe(false)
    expect(checkEntry(SHAPE_SHIFTER)).toEqual([])
    // The roster of the course's nine games holds the same name and modules, and not a 3D scene.
    const row = ROSTER.find((entry) => entry.id === 'shape-shifter')
    expect([row?.title, row?.subtitle, row?.modules, row?.has3d]).toEqual([SHAPE_SHIFTER.title, SHAPE_SHIFTER.subtitle, SHAPE_SHIFTER.modules, false])
  })

  test('is not in the registry yet: W2-T14 routes it', () => {
    expect(GAMES.get('shape-shifter')).toBeUndefined()
    expect(readFileSync(path.join(root, 'packages/play/registry.ts'), 'utf8')).not.toContain('shape-shifter')
  })

  test('lists the five levels in the order they teach, with the titles of the copy table, and grades `fewest` and `grid`', () => {
    expect(SHAPE_SHIFTER.levels.map((level) => level.id)).toEqual([...SHIFT_LEVEL_IDS])
    for (const level of SHAPE_SHIFTER.levels) expect([level.id, level.title]).toEqual([level.id, SHIFT_TITLES[level.id as keyof typeof SHIFT_TITLES]])
    expect(SHAPE_SHIFTER.levels.filter((level) => level.graded).map((level) => level.id)).toEqual([...GRADED])
    expect(SHAPE_SHIFTER.prove).toBe('fewest')
    expect(SHAPE_SHIFTER.levels.find((level) => level.id === SHAPE_SHIFTER.prove)?.graded).toBe(true)
  })

  test('has two keys of its own that take nothing the common keys have', () => {
    expect(keyProblems(SHAPE_SHIFTER.keys)).toEqual([])
    expect(SHAPE_SHIFTER.keys.every((key) => !COMMON_KEYS.some((common) => common.code === key.code))).toBe(true)
  })

  test('names the tensor card, which exists and says its numbers are the course\'s model', () => {
    expect(SHAPE_SHIFTER.card).toBe('tensor')
    const card = readFileSync(path.join(root, 'content/cards', `${SHAPE_SHIFTER.card}.md`), 'utf8')
    expect(card).toContain('Tensor views')
  })

  test('names KCs that are in the KC graph, and claims that are in content/claims', () => {
    const graph = load(readFileSync(path.join(root, 'content/kc/graph.yaml'), 'utf8'), { schema: CORE_SCHEMA }) as { id: string }[]
    for (const id of SHAPE_SHIFTER.kcs) expect([id, graph.some((kc) => kc.id === id)]).toEqual([id, true])
    const claims = load(readFileSync(path.join(root, 'content/claims/tr0.yaml'), 'utf8'), { schema: CORE_SCHEMA }) as { id: string }[]
    for (const id of SHAPE_SHIFTER.claims) expect([id, claims.some((claim) => claim.id === id)]).toEqual([id, true])
    expect(new Set(SHAPE_SHIFTER.claims).size).toBe(SHAPE_SHIFTER.claims.length)
  })

  test('costs a page that lists the games none of the sim: the entry reaches the session only through import()', () => {
    const source = readFileSync(path.join(root, 'packages/play/shape-shifter/entry.ts'), 'utf8')
    expect(source).not.toMatch(/from '\.\/(session|levels|engine|draw|bands|view|score|labels|debrief|copy|blind)'/)
    expect(source).not.toMatch(/@es\/sim/)
    expect(source.match(/import\('\.\/session'\)/g)).toHaveLength(1)
  })

  test('loads its session on demand, and the session is the one the page plays', async () => {
    expect(await SHAPE_SHIFTER.session()).toBe(shiftSession)
  })
})

describe("each practice seed is pinned to the tensor GAMES.md §4.3 prints, and is the first seed from 0 that draws it", () => {
  const seedOf = (id: string): number => SHAPE_SHIFTER.levels.find((level) => level.id === id)?.practiceSeed ?? -1

  test('views: [4, 6]', () => {
    expect(viewsShape(seedOf('views'))).toEqual([4, 6])
    expect(seedOf('views')).toBe(firstSeed((seed) => viewsShape(seed).join() === '4,6'))
  })

  test('stride-zero: a row of 6, expanded to 4 rows', () => {
    expect(strideZeroShape(seedOf('stride-zero'))).toEqual({ row: 6, rows: 4 })
    expect(seedOf('stride-zero')).toBe(firstSeed((seed) => strideZeroShape(seed).row === 6 && strideZeroShape(seed).rows === 4))
  })

  test('three-d: [4, 8] to [2, 4, 4], that is 4 tokens, 2 heads and a head size of 4', () => {
    expect(threeDShape(seedOf('three-d'))).toEqual({ tokens: 4, heads: 2, size: 4 })
    expect(seedOf('three-d')).toBe(firstSeed((seed) => { const s = threeDShape(seed); return s.tokens === 4 && s.heads === 2 && s.size === 4 }))
  })

  test('fewest is graded on seeds the learner is dealt, and any seed is a practice seed; grid is [12, 20] on its one practice seed', () => {
    expect(seedOf('grid')).toBe(GRID_PRACTICE_SEED)
    const practice = shiftSession.level('grid', seedOf('grid'))
    expect([practice.graded, practice.kind === 'grid' ? practice.tasks.map((task) => task.shape) : null]).toEqual([false, [[12, 20]]])
    const dealt = shiftSession.level('grid', 1000)
    expect([dealt.graded, dealt.tasks.length]).toEqual([true, 3])
  })

  test('every practice seed is in band, builds, and starts unfinished; the reference finishes and passes its own grade', () => {
    const check = checkSession(SHAPE_SHIFTER, shiftSession, 60)
    expect(check.problems).toEqual([])
    expect(check.lines).toHaveLength(5)
  })
})
