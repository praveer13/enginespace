/*
 * scripts/pages/plan.ts: which documents the build writes (ARCHITECTURE §3.2, W0-T19).
 *
 *   - Against the real route table and the real sources, the plan has no problem: every route can be enumerated, every document
 *     has an address the router sends to its own route, and no two documents share a title.
 *   - Against fake sources, each kind of route lists what it should, and each thing that can go wrong is a problem that says so.
 *   - PAGES has the routes of ARCHITECTURE §3.1 and no others.
 */
import { describe, expect, test } from 'bun:test'
import { matchRoutes } from 'react-router'
import type { RouteObject } from 'react-router'
import { headingOf, leavesOf, PAGES, planPages } from '../../scripts/pages/plan'
import type { Page, Sources, Written } from '../../scripts/pages/plan'
import { loadSources } from '../../scripts/pages/sources'
import { routes } from '../../src/routes'
import { titled } from '../../src/content/render/model'
import { backticked, between, read, tableRows } from '../ci/support'
import { fakeSources } from './support'

/** The route patterns of ARCHITECTURE §3.1's first column. */
const documented = tableRows(between(read('docs/ARCHITECTURE.md'), '### 3.1 Route table', '### 3.2')).flatMap(([cell]) => backticked(cell))

const urls = (pages: readonly Page[]) => pages.flatMap((page) => (page.url === null ? [] : [page.url]))
const written = (pages: readonly Page[]) => pages.filter((page): page is Written => !page.keep)
const byUrl = (pages: readonly Page[], url: string) => written(pages).find((page) => page.url === url)

/** The route table with one more page after the last real one but the catch-all. */
function withRoute(extra: RouteObject): RouteObject[] {
  const [shell] = routes
  const children = shell.children ?? []
  return [{ ...shell, children: [...children.slice(0, -1), extra, ...children.slice(-1)] }]
}

/** The route table without the route at `path`. */
function without(path: string): RouteObject[] {
  const [shell] = routes
  return [{ ...shell, children: (shell.children ?? []).filter((child) => child.path !== path) }]
}

describe('the route table', () => {
  test('leavesOf finds the routes of ARCHITECTURE §3.1: the same patterns, in the same order', () => {
    expect(documented.length).toBeGreaterThan(10)
    expect(leavesOf(routes).map((leaf) => leaf.pattern)).toEqual(documented)
  })

  test('every leaf names a title, and a page\'s heading is that title without the site\'s name', () => {
    for (const leaf of leavesOf(routes)) expect(leaf.title).not.toBeNull()
    expect(headingOf('Course map · enginespace')).toBe('Course map')
    expect(headingOf('enginespace')).toBe('enginespace')
    expect(headingOf(titled('Design system'))).toBe('Design system')
  })

  test('PAGES has exactly the routes of §3.1', () => {
    expect(Object.keys(PAGES).sort()).toEqual([...documented].sort())
  })
})

describe('the real sources', () => {
  const sources = loadSources()
  const plan = planPages(routes, sources)

  test('give a plan with no problem', () => {
    expect(plan.problems).toEqual([])
  })

  test('list every module of the course, written or planned, and each lesson of the index', () => {
    const wanted = sources.index.modules.flatMap((module) => [module.route, ...module.lessons.map((lesson) => lesson.route)])
    expect(wanted.length).toBeGreaterThan(10)
    expect(urls(plan.pages).filter((url) => url.startsWith('/m/')).sort()).toEqual([...wanted].sort())
  })

  test('list every game of the registry and every lab of the lab list', () => {
    expect(urls(plan.pages).filter((url) => url.startsWith('/play/')).sort()).toEqual(sources.games.map((game) => `/play/${game.id}`).sort())
    expect(urls(plan.pages).filter((url) => url.startsWith('/labs/')).sort()).toEqual(sources.labs.map((lab) => `/labs/${lab}`).sort())
    expect(sources.labs.length).toBeGreaterThan(10)
  })

  test('leave the front page as it was built, and give the fallback no address of its own', () => {
    expect(plan.pages.filter((page) => page.keep).map((page) => page.file)).toEqual(['index.html'])
    const fallback = plan.pages.find((page) => page.file === '404.html')
    expect(fallback).toMatchObject({ keep: false, pattern: '*', url: null, heading: 'Page not found', title: 'Page not found · enginespace' })
  })

  test('send every address to the route that listed it', () => {
    const leaves = new Map(leavesOf(routes).map((leaf) => [leaf.route, leaf.pattern]))
    for (const page of plan.pages) {
      if (page.url === null) continue
      expect([page.url, leaves.get(matchRoutes(routes, page.url)?.at(-1)?.route as RouteObject)]).toEqual([page.url, page.pattern])
    }
  })

  test('give every document its own file, address and title', () => {
    expect(new Set(plan.pages.map((page) => page.file)).size).toBe(plan.pages.length)
    expect(new Set(plan.pages.map((page) => page.title)).size).toBe(plan.pages.length)
    expect(new Set(urls(plan.pages)).size).toBe(urls(plan.pages).length)
  })

  test('give the static pages the titles that their routes put in the tab', () => {
    for (const leaf of leavesOf(routes)) {
      if (leaf.pattern.includes(':') || leaf.pattern === '*') continue
      expect(plan.pages.find((page) => page.pattern === leaf.pattern)?.title).toBe(leaf.title)
    }
  })

  test('give a module and a lesson the title that their page sets once its content has loaded', () => {
    for (const module of sources.index.modules) {
      expect(byUrl(plan.pages, module.route)?.title).toBe(titled(module.title))
      for (const lesson of module.lessons) expect(byUrl(plan.pages, lesson.route)?.title).toBe(titled(lesson.title))
    }
  })

  test('write a sentence for every page, with no empty field and no number in it', () => {
    for (const page of written(plan.pages)) {
      expect(page.description.trim()).not.toBe('')
      expect(page.heading.trim()).not.toBe('')
      // "2D", "3D" and a module's id such as TR0 name things and count nothing. Any other number would need a tag and a source (rule 7).
      expect(page.description.replace(/\b(?:[23]D|TR\d+[ab]?)\b/g, '')).not.toMatch(/\d/)
    }
  })
})

describe('with fake sources', () => {
  const plan = planPages(routes, fakeSources)

  test('lists a document for each of them, under the address its page has', () => {
    expect(plan.problems).toEqual([])
    expect([...urls(plan.pages)].sort()).toEqual(
      [
        '/', '/about', '/changes', '/design', '/evidence', '/labs/hybrid-kv', '/labs/tr8.replay', '/m/tr1', '/m/tr2', '/m/tr2/l1-first', '/map',
        '/play', '/play/gap-hunt', '/play/loop', '/receipts', '/settings', '/today', '/trace-room', '/trace-room/synthetic-1',
      ].sort(),
    )
  })

  test('titles a planned module and a written one by the course index, as their page does', () => {
    expect(byUrl(plan.pages, '/m/tr1')).toMatchObject({ title: 'Read the engines · enginespace', heading: 'Read the engines', description: 'A module of the course that is planned and not written yet.' })
    expect(byUrl(plan.pages, '/m/tr2')?.title).toBe('The step loop & its bubbles · enginespace')
    expect(byUrl(plan.pages, '/m/tr2')?.description).toContain('its lessons')
    expect(byUrl(plan.pages, '/m/tr2/l1-first')).toMatchObject({ title: 'The first "lesson" · enginespace', description: 'A lesson in The step loop & its bubbles.' })
  })

  test('names a game by the display name the registry gives (D-049), with its concept in the sentence', () => {
    expect(byUrl(plan.pages, '/play/loop')).toMatchObject({ title: 'Service · enginespace', heading: 'Service' })
    expect(byUrl(plan.pages, '/play/loop')?.description).toBe('Play the step loop as a seeded game whose rule is the concept itself, in 2D or in 3D.')
    expect(byUrl(plan.pages, '/play/gap-hunt')?.description).toBe('Play trace attribution as a seeded game whose rule is the concept itself, in 2D.')
  })

  test('names a lab and a trace by the id that its address carries', () => {
    expect(byUrl(plan.pages, '/labs/tr8.replay')).toMatchObject({ title: 'Lab tr8.replay · enginespace', heading: 'Lab tr8.replay', file: 'labs/tr8.replay/index.html' })
    expect(byUrl(plan.pages, '/trace-room/synthetic-1')).toMatchObject({ title: 'Trace synthetic-1 · enginespace', file: 'trace-room/synthetic-1/index.html' })
  })

  test('puts each document in the file that Pages serves its address from', () => {
    expect(plan.pages.map((page) => page.file)).toEqual(
      expect.arrayContaining(['index.html', '404.html', 'map/index.html', 'm/tr2/l1-first/index.html', 'play/loop/index.html']),
    )
  })

  test('lists no document for a source with nothing in it, which is no problem: the address falls back to 404.html', () => {
    const empty = planPages(routes, { ...fakeSources, games: [], traces: [] })
    expect(empty.problems).toEqual([])
    expect(urls(empty.pages).filter((url) => url.startsWith('/play/') || url.startsWith('/trace-room/'))).toEqual([])
  })
})

describe('a plan with something wrong in it', () => {
  test('a route that cannot be enumerated is a problem that says where to add it (acceptance 3)', () => {
    const { problems } = planPages(withRoute({ path: 'rooms/:room', Component: () => null, handle: { title: 'Room · enginespace' } }), fakeSources)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/^\/rooms\/:room cannot be enumerated: scripts\/pages\/plan\.ts has no entry for it/)
    expect(problems[0]).toContain('page(description)')
    expect(problems[0]).toContain('each(list)')
  })

  test('a page without parameters that the plan does not know is one too', () => {
    const { problems } = planPages(withRoute({ path: 'glossary', Component: () => null, handle: { title: 'Glossary · enginespace' } }), fakeSources)
    expect(problems.map((problem) => problem.split(' ')[0])).toEqual(['/glossary'])
  })

  test('an entry for a route that the table no longer has is a problem', () => {
    const { problems } = planPages(without('changes'), fakeSources)
    expect(problems).toEqual(['scripts/pages/plan.ts lists /changes, which the route table (src/routes.tsx) does not have: remove the entry'])
  })

  test('a route that names no title is a problem, because a document needs one', () => {
    const { problems } = planPages(withRoute({ path: 'today', Component: () => null }), fakeSources)
    expect(problems.some((problem) => problem.includes('/today') && problem.includes('names no title'))).toBe(true)
  })

  test('two documents with the same title are a problem that names both', () => {
    const twin = { ...fakeSources, index: { ...fakeSources.index, modules: fakeSources.index.modules.map((module) => ({ ...module, title: 'Same' })) } }
    const { problems } = planPages(routes, twin)
    expect(problems).toContain('/m/tr1 and /m/tr2 share the title "Same · enginespace", and every document needs its own')
  })

  test('a lesson titled like a game is caught too, whatever the sources', () => {
    const clash = { ...fakeSources, games: [{ id: 'loop', title: 'The first "lesson"', subtitle: 'the step loop', has3d: true }] }
    const { problems } = planPages(routes, clash)
    expect(problems).toEqual(['/m/tr2/l1-first and /play/loop share the title "The first "lesson" · enginespace", and every document needs its own'])
  })

  test('an address that is not a plain path is a problem, and so is one that leaves the folder', () => {
    for (const bad of ['m/tr1', '/m/tr 1', '/m/../x', '/m/tr1/', '/m//x', '/m/<b>']) {
      const sources: Sources = { ...fakeSources, index: { ...fakeSources.index, modules: [{ ...fakeSources.index.modules[0], route: bad }] } }
      const { problems } = planPages(routes, sources)
      expect(problems.some((problem) => problem.startsWith(`/m/:module: the address "${bad}"`))).toBe(true)
    }
  })

  test('an address that the router sends to another route is a problem: its document would answer the wrong page', () => {
    const sources: Sources = { ...fakeSources, index: { ...fakeSources.index, modules: [{ ...fakeSources.index.modules[0], route: '/map' }] } }
    const { problems } = planPages(routes, sources)
    expect(problems).toContain('/m/:module: the router sends /map to /map, so its document would answer the wrong page')
  })

  test('an address that nothing but the catch-all matches is that problem too', () => {
    const sources: Sources = { ...fakeSources, labs: ['x'] }
    const table = withRoute({ path: 'labs/:lab/extra', Component: () => null, handle: { title: 'Extra · enginespace' } })
    const { problems } = planPages(table, { ...sources, index: { ...fakeSources.index, modules: [{ ...fakeSources.index.modules[0], route: '/nowhere/at/all' }] } })
    expect(problems).toContain('/m/:module: the router sends /nowhere/at/all to *, so its document would answer the wrong page')
  })

  test('two documents at one address, and a document with an empty field, are problems', () => {
    const twice: Sources = { ...fakeSources, index: { ...fakeSources.index, modules: [fakeSources.index.modules[0], { ...fakeSources.index.modules[0], title: 'Other' }] } }
    expect(planPages(routes, twice).problems).toContain('/m/tr1 and /m/tr1 are the same document (m/tr1/index.html)')
    const blank: Sources = { ...fakeSources, index: { ...fakeSources.index, modules: [{ ...fakeSources.index.modules[0], title: '  ' }] } }
    expect(planPages(routes, blank).problems.some((problem) => problem.includes('has an empty heading'))).toBe(true)
  })

  test('a route twice in the table is a problem', () => {
    const [shell] = routes
    const twice: RouteObject[] = [{ ...shell, children: [...(shell.children ?? []), { path: 'map', Component: () => null, handle: { title: 'Map again · enginespace' } }] }]
    expect(planPages(twice, fakeSources).problems).toContain('/map is in the route table twice')
  })
})
