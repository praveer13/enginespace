/*
 * W1-T06: the roster, the course's nine games built or not (packages/play/roster.ts). The Play index draws a line for each, and says
 * what arrives with which wave, so the list has to be the documents' list: D-049's names, ARCHITECTURE §6.1's modules and views, the
 * tracker's waves, and the registry's entries for the games that are built.
 */
import { describe, expect, test } from 'bun:test'
import { GAMES } from '@es/play'
import { ROSTER, rosterEntry } from '@es/play/roster'
import { GAME_TASKS } from '@/content/render/model'
import { GAME_IDS } from '../../scripts/content/directives.ts'
import { backticked, between, read, tableRows } from '../ci/support'

const COURSE_ORDER = ['tr0', 'tr1', 'tr2', 'tr3', 'tr4', 'tr5a', 'tr5b', 'tr6', 'tr7', 'tr8', 'capstone']

describe('the roster', () => {
  test('lists the nine games of ARCHITECTURE §6.1, each once', () => {
    expect(ROSTER.map((entry) => entry.id).sort()).toEqual([...GAME_IDS].sort())
    expect(new Set(ROSTER.map((entry) => entry.id)).size).toBe(9)
  })

  test('runs in the order of the course: by the home module of each game', () => {
    const homes = ROSTER.map((entry) => COURSE_ORDER.indexOf(entry.modules[0]))
    expect(homes.every((index) => index >= 0)).toBe(true)
    expect([...homes].sort((a, b) => a - b)).toEqual(homes)
  })

  test("carries D-049's display name and subtitle for each game", () => {
    const block = between(read('docs/DECISIONS.md'), '### D-049', '### D-050')
    // The table is indented under a bullet, so its lines are read trimmed.
    const rows = tableRows(block.split('\n').map((line) => line.trim()).join('\n'))
    const names = new Map(rows.map(([id, title, subtitle]) => [id.replaceAll('`', ''), { title, subtitle }]))
    expect(names.size).toBe(9)
    for (const entry of ROSTER) expect([entry.id, { title: entry.title, subtitle: entry.subtitle }]).toEqual([entry.id, names.get(entry.id)])
  })

  test("carries ARCHITECTURE §6.1's modules, home first, and says which games have a 3D scene", () => {
    const rows = tableRows(between(read('docs/ARCHITECTURE.md'), '### 6.1 Roster', '### 6.2'))
    expect(rows.length).toBe(9)
    for (const row of rows) {
      const id = backticked(row[0])[0]
      const entry = rosterEntry(id)
      const modules = [...row[3].matchAll(/\bTR(\d[ab]?)\b|\b(capstone)\b/g)].map((match) => (match[2] === undefined ? `tr${match[1]}` : 'capstone'))
      expect([id, entry?.modules]).toEqual([id, modules])
      // The 3D column is a dash for a game with no 3D scene.
      expect([id, entry?.has3d]).toEqual([id, row[5].trim() !== '—'])
    }
    expect(ROSTER.filter((entry) => entry.has3d).length).toBe(6)
  })

  test("carries the tracker's wave: the wave of the first task that builds the game", () => {
    const tracker = read('docs/TRACKER.md')
    for (const entry of ROSTER) {
      const heading = new RegExp(`^#### \\[.\\] W(\\d)-T\\d\\d · [^\\n]*\\(\`${entry.id}\`\\)`, 'm').exec(tracker)
      expect([entry.id, heading === null ? null : Number(heading[1])]).toEqual([entry.id, entry.wave])
    }
  })

  test("agrees with the pending-block table's task for each game that is not built in W0", () => {
    for (const entry of ROSTER.filter((candidate) => candidate.wave > 0)) {
      expect([entry.id, Number(GAME_TASKS[entry.id].slice(1, 2))]).toEqual([entry.id, entry.wave])
    }
  })

  test('is frozen, and rosterEntry finds a game by its id and nothing by any other name', () => {
    expect(Object.isFrozen(ROSTER)).toBe(true)
    expect(rosterEntry('loop')?.title).toBe('Service')
    expect(rosterEntry('constructor')).toBeUndefined()
    expect(rosterEntry('nope')).toBeUndefined()
  })
})

describe('the registry and the roster', () => {
  test('say the same of every game that is built', () => {
    expect(GAMES.games.length).toBeGreaterThan(0)
    for (const game of GAMES.games) {
      const entry = rosterEntry(game.id)
      expect([game.id, entry === undefined]).toEqual([game.id, false])
      expect([game.id, { title: entry?.title, subtitle: entry?.subtitle, has3d: entry?.has3d, modules: entry?.modules }]).toEqual([
        game.id,
        { title: game.title, subtitle: game.subtitle, has3d: game.has3d, modules: game.modules },
      ])
    }
  })

  test('have Service built in W0, so its wave is the front page\'s', () => {
    expect(GAMES.has('loop')).toBe(true)
    expect(rosterEntry('loop')?.wave).toBe(0)
  })
})
