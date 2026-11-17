/*
 * W1-T06, R-T04: the roster, the course's nine games built or not (packages/play/roster.ts). The Games index draws a line for each, so the
 * list has to be the documents' list: D-063's titles and subtitles (REDESIGN §2.7's table, which GAMES.md §2.6 copies), the role lines of
 * REDESIGN §2.6, ARCHITECTURE §6.1's names, modules and views, the tracker's task titles and waves, and the registry's entries for the games
 * that are built.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { GAMES } from '@es/play'
import { ROSTER, rosterEntry } from '@es/play/roster'
import { GAME_TASKS } from '@/content/render/model'
import { GAME_IDS } from '../../scripts/content/directives.ts'
import { backticked, between, read, root, tableRows } from '../ci/support'

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

  test("carries D-063's title and subtitle for each game: REDESIGN §2.7's table, which D-063 adopts, and GAMES.md §2.6's copy of it", () => {
    // D-063 names REDESIGN §2.7 as the policy, with its table of game titles and subtitles.
    expect(between(read('docs/DECISIONS.md'), '### D-063', '### D-064')).toContain('REDESIGN §2.7 is the policy')
    const brief = tableRows(between(read('docs/REDESIGN.md'), '**Games**', '**Labs.**'))
    const names = new Map(brief.map(([id, , title, subtitle]) => [id.replaceAll('`', ''), { title: title.replaceAll('**', ''), subtitle }]))
    expect(names.size).toBe(9)
    for (const entry of ROSTER) expect([entry.id, { title: entry.title, subtitle: entry.subtitle }]).toEqual([entry.id, names.get(entry.id)])
    const games = tableRows(between(read('docs/GAMES.md'), '#### The games', '#### Step loop'))
    const byId = (rows: { id: string }[]) => [...rows].sort((x, y) => x.id.localeCompare(y.id))
    expect(byId(games.map(([id, title, subtitle, role]) => ({ id: backticked(id)[0], title: title.replaceAll('**', ''), subtitle, role })))).toEqual(
      byId(ROSTER.map((entry) => ({ id: entry.id, title: entry.title, subtitle: entry.subtitle, role: entry.role }))),
    )
  })

  test("carries REDESIGN §2.6's role line for each built game, and a role line of the same form for the rest", () => {
    const roles = new Map(tableRows(between(read('docs/REDESIGN.md'), '**Role lines**', '**The first run')).map(([title, role]) => [title, role]))
    expect(roles.size).toBe(5)
    for (const [title, role] of roles) expect([title, ROSTER.find((entry) => entry.title === title)?.role]).toEqual([title, role])
    for (const entry of ROSTER) expect([entry.id, /^You [a-z][^.]*\.$/.test(entry.role), entry.role.split(' ').length <= 6]).toEqual([entry.id, true, true])
  })

  test("carries ARCHITECTURE §6.1's title and subtitle and its modules, home first, and says which games have a 3D scene", () => {
    const rows = tableRows(between(read('docs/ARCHITECTURE.md'), '### 6.1 Roster', '### 6.2'))
    expect(rows.length).toBe(9)
    for (const row of rows) {
      const id = backticked(row[0])[0]
      const entry = rosterEntry(id)
      expect([id, row[2]]).toEqual([id, `**${entry?.title}** · *${entry?.subtitle}*`])
      const modules = [...row[3].matchAll(/\bTR(\d[ab]?)\b|\b(capstone)\b/g)].map((match) => (match[2] === undefined ? `tr${match[1]}` : 'capstone'))
      expect([id, entry?.modules]).toEqual([id, modules])
      // The 3D column is a dash for a game with no 3D scene.
      expect([id, entry?.has3d]).toEqual([id, row[5].trim() !== '—'])
    }
    expect(ROSTER.filter((entry) => entry.has3d).length).toBe(5)
  })

  test("carries the tracker's wave, the wave of the first task that builds the game, and every such task's title names the game by its title", () => {
    const tracker = read('docs/TRACKER.md')
    for (const entry of ROSTER) {
      const heading = new RegExp(`^#### \\[.\\] W(\\d)-T\\d\\d · [^\\n]*\\(\`${entry.id}\`\\)`, 'm').exec(tracker)
      expect([entry.id, heading === null ? null : Number(heading[1])]).toEqual([entry.id, entry.wave])
      const headings = [...tracker.matchAll(new RegExp(`^#### \\[.\\] W\\d-T\\d\\d · ([^\\n]*)\\(\`${entry.id}\`\\)`, 'gm'))].map((m) => m[1])
      expect(headings.length).toBeGreaterThan(0)
      for (const title of headings) expect([entry.id, title.endsWith(`${entry.title} `)]).toEqual([entry.id, true])
    }
  })

  test("agrees with the pending-block table: a game the registry does not have yet is listed with a task of the roster's wave, and one it has is not listed (W1b-T01)", () => {
    for (const entry of ROSTER) {
      const task = Object.hasOwn(GAME_TASKS, entry.id) ? GAME_TASKS[entry.id] : null
      if (GAMES.has(entry.id)) expect([entry.id, task]).toEqual([entry.id, null])
      else expect([entry.id, task === null ? null : Number(task.slice(1, 2))]).toEqual([entry.id, entry.wave])
    }
  })

  test('is frozen, and rosterEntry finds a game by its id and nothing by any other name', () => {
    expect(Object.isFrozen(ROSTER)).toBe(true)
    expect(rosterEntry('loop')?.title).toBe('Step loop')
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
      // A game's 3D scene can be a later task than its session and its 2D view (W1-T28 builds The Tasting, and W1-T29 its scene), and
      // verify:games holds `has3d` to the scene's file. So a game that is built has the roster's 3D from the day its scene is in the tree.
      const scene = existsSync(path.join(root, 'src/games', game.id, 'Scene3D.tsx'))
      expect([game.id, { title: entry?.title, subtitle: entry?.subtitle, has3d: entry?.has3d === true && scene, modules: entry?.modules }]).toEqual([
        game.id,
        { title: game.title, subtitle: game.subtitle, has3d: game.has3d, modules: game.modules },
      ])
    }
  })

  test('have Step loop built in W0, so its wave is the front page\'s', () => {
    expect(GAMES.has('loop')).toBe(true)
    expect(rosterEntry('loop')?.wave).toBe(0)
  })
})
