/*
 * W2b-T100: the registry's record of Trace attribution, held to what the code does and to the content it names. The game is not registered yet
 * (W2-T20 builds its 2D view in the frame and adds the record), so the record is checked here and not by `verify:games`: its KCs are in the
 * graph, its card exists, its keys take nothing the common keys have, the entry reaches the session only through import(), and every level has
 * a pinned practice seed that is in band and whose reference passes.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { load, CORE_SCHEMA } from 'js-yaml'
import { COMMON_KEYS, GAMES, keyProblems } from '@es/play'
import { GAP_HUNT } from '@es/play/gap-hunt/entry'
import { HUNT_TITLES } from '@es/play/gap-hunt/copy'
import { GRADED } from '@es/play/gap-hunt/levels'
import { huntSession } from '@es/play/gap-hunt/session'
import { HUNT_LEVEL_IDS } from '@es/play/gap-hunt/types'
import { ROSTER } from '@es/play/roster'
import { checkEntry, checkSession } from '../../scripts/verify-games'

const root = path.resolve(import.meta.dirname, '../..')

describe("the registry's record of Trace attribution", () => {
  test("is D-063's: the title over its subtitle, the id `gap-hunt`, TR3, and no 3D scene; the roster holds the same", () => {
    expect([GAP_HUNT.id, GAP_HUNT.title]).toEqual(['gap-hunt', 'Trace attribution'])
    expect(GAP_HUNT.modules).toEqual(['tr3'])
    expect(GAP_HUNT.has3d).toBe(false)
    expect(checkEntry(GAP_HUNT)).toEqual([])
    const row = ROSTER.find((entry) => entry.id === 'gap-hunt')
    expect([row?.title, row?.subtitle, row?.has3d]).toEqual([GAP_HUNT.title, GAP_HUNT.subtitle, false])
    expect(row?.modules).toContain('tr3')
  })

  test('is not registered: no route grows, and the registry file does not name it', () => {
    expect(GAMES.get('gap-hunt')).toBeUndefined()
    expect(readFileSync(path.join(root, 'packages/play/registry.ts'), 'utf8')).not.toContain('GAP_HUNT')
  })

  test('lists the four levels built now in the order they teach, with the copy table\'s titles; `gap` and `attribute` are graded and `attribute` is the Prove level', () => {
    expect(GAP_HUNT.levels.map((level) => level.id)).toEqual([...HUNT_LEVEL_IDS])
    for (const level of GAP_HUNT.levels) expect([level.id, level.title]).toEqual([level.id, HUNT_TITLES[level.id as keyof typeof HUNT_TITLES]])
    expect(GAP_HUNT.levels.filter((level) => level.graded).map((level) => level.id)).toEqual([...GRADED])
    expect(GAP_HUNT.prove).toBe('attribute')
    expect(GAP_HUNT.levels.find((level) => level.id === GAP_HUNT.prove)?.graded).toBe(true)
    // `pinned` and `yours` are not built: the record lists neither.
    expect(GAP_HUNT.levels.some((level) => level.id === 'pinned' || level.id === 'yours')).toBe(false)
  })

  test("has keys of its own that take nothing the common keys have, and that the page's help can print", () => {
    expect(keyProblems(GAP_HUNT.keys)).toEqual([])
    expect(GAP_HUNT.keys.every((key) => !COMMON_KEYS.some((common) => common.code === key.code))).toBe(true)
    // The keys of the design: J and K jump between edges, a digit chooses a category, X names the cause.
    const codes = GAP_HUNT.keys.map((key) => key.code)
    for (const code of ['KeyJ', 'KeyK', 'KeyX', 'Digit1', 'Digit2', 'Digit3', 'Digit4']) expect(codes).toContain(code)
  })

  test('names the trace card, which exists, and KCs that are in the KC graph', () => {
    expect(GAP_HUNT.card).toBe('trace-room-trace')
    expect(readFileSync(path.join(root, 'content/cards', `${GAP_HUNT.card}.md`), 'utf8').length).toBeGreaterThan(0)
    const graph = load(readFileSync(path.join(root, 'content/kc/graph.yaml'), 'utf8'), { schema: CORE_SCHEMA }) as { id: string }[]
    for (const id of GAP_HUNT.kcs) expect([id, graph.some((kc) => kc.id === id)]).toEqual([id, true])
  })

  test('costs a page that lists the games none of the sim: the entry reaches the session only through import()', () => {
    const source = readFileSync(path.join(root, 'packages/play/gap-hunt/entry.ts'), 'utf8')
    expect(source).not.toMatch(/from '\.\/(session|levels|engine|bands|view|score|debrief|copy|blind)'/)
    expect(source).not.toMatch(/@es\/sim/)
    expect(source.match(/import\('\.\/session'\)/g)).toHaveLength(1)
  })

  test('loads its session on demand, and the session is the one the page plays', async () => {
    expect(await GAP_HUNT.session()).toBe(huntSession)
  })

  test('every level is built on its practice seed, is in band, starts unfinished and its reference passes its own grade', () => {
    const check = checkSession(GAP_HUNT, huntSession, 60)
    expect(check.problems).toEqual([])
    expect(check.lines).toHaveLength(4)
  })

  test('a practice seed is a practice run and any other seed a graded one, on `gap` and `attribute`; `read` and `graphs` are never graded', () => {
    for (const id of HUNT_LEVEL_IDS) {
      const practice = huntSession.level(id, 0)
      const dealt = huntSession.level(id, 1000)
      expect([id, practice.graded, practice.cases.length]).toEqual([id, false, 1])
      expect([id, dealt.graded, dealt.cases.length]).toEqual([id, GRADED.includes(id), GRADED.includes(id) ? 3 : 1])
    }
  })
})
