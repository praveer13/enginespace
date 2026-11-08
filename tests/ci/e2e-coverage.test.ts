/*
 * W1-T36's end-to-end coverage, held to the game registry. A Playwright spec cannot run under Bun, so these tests read what the suite
 * is made of (e2e/routes.ts and e2e/levels.ts are plain data for this), and fail when a game, a level or a scene exists that the suite
 * does not reach:
 *   - every game's page is in the pull-request subset's routes, so that axe at 360 and 1280 px, the reduced-motion scan and the network
 *     check all visit it;
 *   - the pages of the full service's levels, which the document list does not reach, name levels that the registry has;
 *   - every level of every game is walked by keyboard: on the front page (First service), or by e2e/walks.spec.ts with a walker
 *     in e2e/support/walks.ts; and a pull request walks one level of each game;
 *   - the walks, the 3D scenes and the routes are all in the projects that run them.
 * The spec itself checks the registry again in a browser (its first test), so a walker that is missing fails there too.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { GAMES } from '@es/play'
import { FIRST_SERVICE } from '@es/play/loop/entry'
import { FRONT_LEVELS, SMOKE_LEVELS, WALKED } from '../../e2e/levels'
import { PR_ROUTES, W1_LEVEL_PAGES, W1_ROUTES } from '../../e2e/routes'
import { read, root } from './support'

const PATH = /^\/(?:[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*)?$/
const walked: Readonly<Record<string, readonly string[]>> = WALKED
const smoke: Readonly<Record<string, string>> = SMOKE_LEVELS

describe("W1's routes", () => {
  test('are paths in the route table\'s notation, each once, and none repeats the pull request\'s eight', () => {
    for (const route of W1_ROUTES) expect(route).toMatch(PATH)
    expect(new Set(W1_ROUTES).size).toBe(W1_ROUTES.length)
    expect(W1_ROUTES.filter((route) => PR_ROUTES.includes(route))).toEqual([])
  })

  test('hold the four modules that W1 wrote with a lesson of each, the Play index, the other four games, the forge\'s two labs and Today', () => {
    for (const module of ['tr1', 'tr5a', 'tr6', 'tr8']) {
      expect(W1_ROUTES).toContain(`/m/${module}`)
      expect(W1_ROUTES.filter((route) => route.startsWith(`/m/${module}/`))).toHaveLength(1)
    }
    for (const route of ['/play', '/labs/hybrid-kv', '/labs/rejection-sampler', '/today']) expect(W1_ROUTES).toContain(route)
    expect(W1_ROUTES).toHaveLength(16)
  })

  test('reach the page of every game in the registry, so that a game that is added has its page audited', () => {
    const visited = new Set([...PR_ROUTES, ...W1_ROUTES])
    expect(GAMES.games.map((game) => `/play/${game.id}`).filter((route) => !visited.has(route))).toEqual([])
  })
})

describe('the pages of the full service\'s levels', () => {
  const loop = GAMES.get('loop')

  test('are `?level=` pages of Service, each of a level that the registry has, and each once', () => {
    expect(loop).toBeDefined()
    const ids = new Set(loop?.levels.map((level) => level.id))
    for (const page of W1_LEVEL_PAGES) {
      const match = /^(\/play\/loop)\?level=([a-z0-9-]+)$/.exec(page)
      expect(match, page).not.toBeNull()
      expect(ids.has(match?.[2] ?? ''), `${page} names a level of the registry`).toBe(true)
    }
    expect(new Set(W1_LEVEL_PAGES).size).toBe(W1_LEVEL_PAGES.length)
  })

  test('are the levels of the full service and none of the first service\'s, which the front page plays', () => {
    const first = new Set(FIRST_SERVICE.map((level) => level.id))
    expect(W1_LEVEL_PAGES.map((page) => page.split('level=')[1])).toEqual(walked.loop)
    expect(W1_LEVEL_PAGES.filter((page) => first.has(page.split('level=')[1]))).toEqual([])
  })
})

describe('the keyboard walks', () => {
  test('cover every level of every game: the front page plays First service, and the rest are walked', () => {
    expect([...FRONT_LEVELS]).toEqual(FIRST_SERVICE.map((level) => level.id))
    const missing: string[] = []
    for (const game of GAMES.games) {
      for (const level of game.levels) {
        const front = game.id === 'loop' && (FRONT_LEVELS as readonly string[]).includes(level.id)
        if (!front && !(walked[game.id] ?? []).includes(level.id)) missing.push(`${game.id}/${level.id}`)
      }
    }
    expect(missing, 'levels that no keyboard walk plays (add them to e2e/levels.ts and a walker to e2e/support/walks.ts)').toEqual([])
  })

  test('name nothing that the registry does not have, and walk each level once', () => {
    const known = new Set(GAMES.games.flatMap((game) => game.levels.map((level) => `${game.id}/${level.id}`)))
    for (const [id, levels] of Object.entries(walked)) {
      expect(new Set(levels).size).toBe(levels.length)
      for (const level of levels) expect(known.has(`${id}/${level}`), `${id}/${level} is in the registry`).toBe(true)
    }
  })

  test('walk one level of each game in a pull request, and it is a walked one', () => {
    expect(Object.keys(smoke).sort()).toEqual(Object.keys(walked).sort())
    for (const [id, level] of Object.entries(smoke)) expect(walked[id]).toContain(level)
  })

  test('are played by a spec that the smoke project runs, which checks the registry again in a browser for a walker of every level', () => {
    expect(existsSync(path.join(root, 'e2e/walks.spec.ts'))).toBe(true)
    expect(read('playwright.config.ts')).toContain("'walks'")
    // The spec's first test fails on a level that has no walker in e2e/support/walks.ts, in the pull-request subset and in the nightly sweep.
    expect(read('e2e/walks.spec.ts')).toContain('e2e/support/walks.ts has no walker for it')
  })
})

describe('the 3D scenes', () => {
  test('of every game that has one are checked by the reduced-motion spec, which reads the registry for them', () => {
    const site = read('e2e/support/site.ts')
    // `HAS_3D` is built from the registry's `has3d`, so a game that adds a scene is covered without being listed anywhere.
    expect(site).toContain('GAMES.games.filter((game) => game.has3d)')
    expect(read('e2e/reduced-motion.spec.ts')).toContain('ROUTES.filter(SCENE_IN_RUN)')
    expect(GAMES.games.filter((game) => game.has3d).map((game) => game.id).sort()).toEqual(['engine-floor', 'loop', 'pool', 'verifier'])
  })
})
