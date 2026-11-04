/*
 * W0-T01's acceptance checks 2 and 3, as tests.
 *
 *   - package.json pins every dependency exactly, and the pins equal ARCHITECTURE §14's tables.
 *   - Every route in ARCHITECTURE §3.1 renders a stub whose <h1> names it, and any other URL renders the 404 page.
 *
 * Both read docs/ARCHITECTURE.md itself, so a change to the document without the code (or the reverse) fails here.
 * The pages render on the server renderer with the static router: no DOM is needed, and the lazy route modules load
 * the way the browser's router loads them.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createStaticHandler, createStaticRouter, matchRoutes, StaticRouter, StaticRouterProvider } from 'react-router'
import type { RouteObject } from 'react-router'
import { AppLoading } from '@/App'
import type { RouteHandle } from '@/App'
import { routes } from '@/routes'

const root = path.resolve(import.meta.dirname, '..')
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8')
const architecture = read('docs/ARCHITECTURE.md')

/** The text between two markers. A renamed heading throws instead of silently parsing nothing. */
function between(text: string, from: string, to: string): string {
  const start = text.indexOf(from)
  const end = text.indexOf(to, start + from.length)
  if (start < 0 || end < 0) throw new Error(`docs/ARCHITECTURE.md no longer has "${from}" followed by "${to}"`)
  return text.slice(start + from.length, end)
}

/** The cells of each row of the first markdown table in `text`, without its header and separator rows. */
function tableRows(text: string): string[][] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .slice(2)
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
}

const backticked = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1])

describe('package.json against ARCHITECTURE §14', () => {
  /** In §14's tables but not in package.json yet, and the task that adds each. */
  const deferred = new Map([['fuse.js', 'W3-T07 adds search']])

  /** A§14's table: each package name in the first cell, and the exact version that opens the second. */
  function pinsIn(section: string): Map<string, string> {
    const pins = new Map<string, string>()
    for (const [names, version] of tableRows(section)) {
      const exact = /^\d+\.\d+\.\d+/.exec(version)?.[0]
      if (!exact) throw new Error(`§14 row "${names}" has no exact version: "${version}"`)
      for (const name of backticked(names)) pins.set(name, exact)
    }
    return pins
  }

  const section14 = between(architecture, '## 14. Exact dependency versions', '**Python**')
  const runtime = pinsIn(between(section14, '**Runtime**', '**Development**'))
  const development = pinsIn(between(section14, '**Development**', '**Not used**'))
  const notUsed = backticked(between(section14, '**Not used**', '\n\n'))
  const withoutDeferred = (pins: Map<string, string>) => Object.fromEntries([...pins].filter(([name]) => !deferred.has(name)))

  type Manifest = Record<string, Record<string, string> | undefined>
  const pkg = JSON.parse(read('package.json')) as Manifest
  const lock = JSON.parse(read('package-lock.json')) as { packages: Record<string, { version?: string } & Manifest> }

  test('§14 parses into a runtime table and a development table', () => {
    expect(runtime.size).toBeGreaterThan(10)
    expect(development.size).toBeGreaterThan(10)
    expect(runtime.get('react')).toBe('19.2.3')
    expect(development.get('vite')).toBe('7.3.0')
    expect([...deferred.keys()].every((name) => runtime.has(name) || development.has(name))).toBe(true)
  })

  test('dependencies are §14 runtime table, and devDependencies its development table', () => {
    expect(pkg.dependencies).toEqual(withoutDeferred(runtime))
    expect(pkg.devDependencies).toEqual(withoutDeferred(development))
  })

  test('no version is a range: no caret, no tilde, nothing but x.y.z', () => {
    const ranges: string[] = []
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'overrides']) {
      for (const [name, range] of Object.entries(pkg[field] ?? {})) {
        if (!/^\d+\.\d+\.\d+$/.test(range)) ranges.push(`${field}.${name}: ${range}`)
      }
    }
    expect(ranges).toEqual([])
  })

  test('package-lock.json is in step: it records the same specs and resolves each to its pin', () => {
    const rootEntry = lock.packages['']
    expect(rootEntry.dependencies).toEqual(pkg.dependencies)
    expect(rootEntry.devDependencies).toEqual(pkg.devDependencies)
    const resolved: Record<string, string | undefined> = {}
    const wanted: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const name of Object.keys(wanted)) resolved[name] = lock.packages[`node_modules/${name}`]?.version
    expect(resolved).toEqual(wanted)
  })

  test('nothing on §14\'s "Not used" list is installed', () => {
    expect(notUsed.length).toBeGreaterThan(0)
    expect(notUsed.filter((name) => `node_modules/${name}` in lock.packages)).toEqual([])
  })
})

describe('routes against ARCHITECTURE §3.1', () => {
  /**
   * What each §3.1 route's stub shows: its <h1>, the route parameters it echoes, and its document title, which is the
   * page name and the site name unless the route says otherwise.
   */
  const stubs: Record<string, { h1: string; shows?: string; title?: string }> = {
    // The front page's heading is printed on its order ticket (W0-T18).
    '/': { h1: 'Fire the next step.', title: 'enginespace' },
    '/map': { h1: 'Course map' },
    // The module and lesson pages load their content in the browser (W0-T09), so the server renders the ticket that is still printing.
    '/m/:module': { h1: 'Module', shows: 'Printing the module' },
    '/m/:module/:lesson': { h1: 'Lesson', shows: 'tr2 / l0-sample' },
    '/play': { h1: 'Games' },
    '/play/:game': { h1: 'Play Service', shows: 'Loading Service', title: 'Game · enginespace' },
    '/labs/:lab': { h1: 'Lab', shows: 'Lab id: tr8.replay' },
    '/trace-room': { h1: 'The Trace Room' },
    '/trace-room/:trace': { h1: 'The Trace Room', shows: 'Trace id: sample' },
    '/receipts': { h1: 'Receipts' },
    '/today': { h1: 'Today' },
    '/evidence': { h1: 'Evidence' },
    '/design': { h1: 'Design system' },
    '/settings': { h1: 'Settings' },
    '/about': { h1: 'About' },
    '/changes': { h1: 'Changes' },
    '*': { h1: 'Page not found' },
  }
  const params: Record<string, string> = { module: 'tr2', lesson: 'l0-sample', game: 'loop', lab: 'tr8.replay', trace: 'sample' }

  /** Every route pattern in §3.1's first column, in table order. */
  const patterns = tableRows(between(architecture, '### 3.1 Route table', '### 3.2')).flatMap(([cell]) => backticked(cell))

  /** A URL that the pattern matches. The catch-all gets one nothing else matches. */
  const urlFor = (pattern: string) =>
    pattern === '*' ? '/nope' : pattern.replace(/:(\w+)/g, (_, name: string) => params[name] ?? `unknown-${name}`)

  /** The leaf routes' full paths, in the notation of §3.1 (`*` for the catch-all). */
  function leafPatterns(table: RouteObject[], parent = ''): string[] {
    return table.flatMap((route) => {
      const here = route.index || route.path === undefined ? parent : `${parent.replace(/\/$/, '')}/${route.path.replace(/^\//, '')}`
      if (route.children) return leafPatterns(route.children, here)
      return [here === '/*' ? '*' : here]
    })
  }

  async function render(url: string, basename = '/', table: RouteObject[] = routes): Promise<string> {
    const handler = createStaticHandler(table, { basename })
    const context = await handler.query(new Request(new URL(url, 'http://localhost')))
    if (context instanceof Response) throw new Error(`${url} answered with a ${context.status} response`)
    const router = createStaticRouter(handler.dataRoutes, context)
    const html = renderToString(createElement(StaticRouterProvider, { router, context, hydrate: false }))
    return html.replaceAll('<!-- -->', '')
  }

  /** The text of every <h1>, without the markup inside it. */
  const h1sIn = (html: string) => [...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/gs)].map((match) => match[1].replace(/<[^>]+>/g, ''))
  /** The title App puts in document.title for a URL: the `handle` of the deepest route that names one. */
  const titleOf = (url: string) =>
    matchRoutes(routes, url)
      ?.map((match) => (match.route.handle as RouteHandle | undefined)?.title)
      .filter(Boolean)
      .at(-1)

  test('§3.1 parses into its route patterns', () => {
    expect(patterns.length).toBeGreaterThan(10)
    expect(patterns).toContain('/m/:module/:lesson')
    expect(patterns).toContain('*')
  })

  test('the stub table covers exactly the routes in §3.1', () => {
    expect(Object.keys(stubs).sort()).toEqual([...patterns].sort())
  })

  test('the route table has exactly the routes in §3.1: no more, no fewer', () => {
    expect(leafPatterns(routes).sort()).toEqual([...patterns].sort())
  })

  for (const pattern of patterns) {
    const { h1, shows, title } = stubs[pattern] ?? { h1: '(no stub listed)' }
    test(`${pattern} renders a stub whose only <h1> is "${h1}", under the title "${title ?? `${h1} · enginespace`}"`, async () => {
      const html = await render(urlFor(pattern))
      expect(h1sIn(html)).toEqual([h1])
      expect(html).toContain('<main id="main"')
      if (shows) expect(html).toContain(shows)
      // The route names the title, and App sets it. A page that rendered its own <title> would add a second one.
      expect(titleOf(urlFor(pattern))).toBe(title ?? `${h1} · enginespace`)
      expect(html).not.toContain('<title')
    })
  }

  test('a URL that no route in §3.1 matches renders the 404 page', async () => {
    for (const url of ['/nope', '/m', '/m/tr2/l0-sample/extra', '/play/loop/extra', '/labs', '/receipts/abc']) {
      expect(h1sIn(await render(url))).toEqual(['Page not found'])
    }
  })

  test('only the 404 page is in the entry: every other page is a lazy route', () => {
    const [shell] = routes
    const leaves = shell.children ?? []
    const eager = leaves.filter((route) => route.Component).map((route) => route.path)
    expect(eager).toEqual(['*'])
    expect(leaves.filter((route) => !route.Component).every((route) => typeof route.lazy === 'function')).toBe(true)
  })

  describe('the shell around every page (§3.3)', () => {
    const linksIn = (html: string, label: string) => {
      const nav = new RegExp(`<nav aria-label="${label}"[^>]*>(.*?)</nav>`, 's').exec(html)?.[1] ?? ''
      return [...nav.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs)].map((match) => [match[1], match[2]])
    }

    test('the primary navigation is Map, Play, Today, Receipts and Evidence, and the footer has the other four', async () => {
      const html = await render('/')
      expect(linksIn(html, 'Primary')).toEqual([
        ['/', 'enginespace'],
        ['/map', 'Map'],
        ['/play', 'Play'],
        ['/today', 'Today'],
        ['/receipts', 'Receipts'],
        ['/evidence', 'Evidence'],
      ])
      expect(linksIn(html, 'Footer')).toEqual([
        ['/about', 'About'],
        ['/changes', 'Changes'],
        ['/settings', 'Settings'],
        ['/design', 'Design'],
      ])
    })

    test('no navigation link points at the 404 page', async () => {
      const html = await render('/')
      const hrefs = [...linksIn(html, 'Primary'), ...linksIn(html, 'Footer')].map(([href]) => href)
      const dead = hrefs.filter((href) => matchRoutes(routes, href)?.at(-1)?.route.path === '*')
      expect(dead).toEqual([])
    })

    test('under /enginespace/ every link keeps the base path, so the site works on GitHub Pages', async () => {
      const html = await render('/enginespace/map', '/enginespace/')
      expect(h1sIn(html)).toEqual(['Course map'])
      const hrefs = [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1])
      expect(hrefs.length).toBeGreaterThan(8)
      expect(hrefs.filter((href) => href !== '#main' && !href.startsWith('/enginespace/'))).toEqual([])
    })

    test('the skip link targets the main landmark', async () => {
      const html = await render('/')
      expect(html).toContain('<a href="#main"')
      expect(html).toContain('<main id="main" tabindex="-1"')
    })

    test('the route announcer is one empty status region after the footer, outside the landmark: a load says nothing (src/App.tsx)', async () => {
      for (const url of ['/', '/map', '/m/tr2', '/nope']) {
        const html = await render(url)
        expect(html.match(/data-live="route"/g), url).toHaveLength(1)
        expect(html, url).toContain('<div role="status" class="sr-only" data-live="route"></div>')
        expect(html.indexOf('data-live="route"'), url).toBeGreaterThan(html.indexOf('</footer>'))
        expect(/<main id="main"[^>]*>.*<\/main>/s.exec(html)?.[0] ?? '', url).not.toContain('data-live="route"')
      }
    })

    test('a route that fails to load shows the error page inside the shell, with a way to reload', async () => {
      const failing: RouteObject[] = [
        { ...routes[0], children: [{ path: 'boom', lazy: () => Promise.reject(new Error('Failed to fetch dynamically imported module')) }] },
      ]
      const html = await render('/boom', '/', failing)
      expect(h1sIn(html)).toEqual(['Something went wrong'])
      expect(html).toContain('Failed to fetch dynamically imported module')
      expect(html).toContain('>Reload</button>')
      expect(linksIn(html, 'Primary').length).toBeGreaterThan(1)
    })

    test('while the first route module loads, the shell shows a status message', () => {
      const html = renderToString(createElement(StaticRouter, { location: '/map' }, createElement(AppLoading)))
      expect(html).toContain('<p role="status">Loading')
      expect(linksIn(html, 'Primary').length).toBeGreaterThan(1)
    })
  })
})
