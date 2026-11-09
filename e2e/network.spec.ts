/*
 * W0-T21, acceptance 3: no request leaves the origin during the walk (ARCHITECTURE §1 I1, §12; D-009 and D-033). D-033: "The site makes
 * no request outside its origin. Fonts are self-hosted, and there are no CDNs, embeds or analytics. The CSP sets `connect-src 'self'`,
 * and an e2e test enforces it."
 *
 * Every spec of the smoke subset is watched (e2e/support/site.ts): a request to another origin is refused and fails the test, and so
 * does anything the page's own policy refuses. This spec is the one that says so, and that proves the net can catch:
 *
 *   - the front-page walk, with the 3D pass drawn (its chunks, three's, and the scene's own loads are all in the walk): the visitor
 *     plays the first level and reads its debrief; and again with the learner's "3D off", playing on to the last level;
 *   - each of the eight routes, W1's games and labs and the full service's richest level (e2e/routes.ts, W1-T36), and every link of the
 *     navigation and the footer, by the router: every lazy chunk of a page; under ES_E2E_NIGHTLY=1, every document that prepare-pages
 *     writes and the five levels of the full service, with each document's own meta CSP;
 *   - the faces: every font that loads is one of public/fonts/fonts.json's, from the origin (W0-T05's fifth check);
 *   - the policy: the document that is served carries the meta CSP as the first element after `<meta charset>`, with `connect-src
 *     'self'` and no 'unsafe-eval' (§12), and the browser enforces it: a `fetch` to another origin is refused by the policy, and a
 *     navigation to another origin is refused by the net, and both are seen;
 *   - the policy refuses nothing on any of the routes: zod's probe of `new Function('')`, which the pages that load the ledger used to
 *     make, is gone since every schema is built jitless (packages/schema/zod.ts, D-059), and KNOWN_REFUSALS is empty.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PR_ROUTES, W1_LEVEL_PAGES, W1_ROUTES } from './routes'
import { front, playToTheDebrief } from './support/front'
import { documentRoutes, expect, HAS_3D, KNOWN_REFUSALS, NIGHTLY, open, quiet, ready, SCENE_IN_RUN, settled3d, test, withSettings } from './support/site'

const root = path.resolve(import.meta.dirname, '..')
/**
 * The pages whose own visit is a network check. A pull request visits the eight, and of W1's the pages that load a game or a lab from its
 * lazy chunks (the games, the labs, and the full service's richest level; every other page of W1 is visited by the axe and reduced-motion
 * specs, and support/site.ts fails any test whose page reaches outside the origin, so they are watched all the same). The nightly sweep
 * visits every document and the full service's five levels.
 */
const W1_LAZY = W1_ROUTES.filter((route) => route.startsWith('/play/') || route.startsWith('/labs/'))
const ROUTES = NIGHTLY ? [...documentRoutes(), ...W1_LEVEL_PAGES] : [...PR_ROUTES, ...W1_LAZY, ...W1_LEVEL_PAGES.filter((page) => page.endsWith('?level=graphs'))]
const FACES = (JSON.parse(readFileSync(path.join(root, 'public/fonts/fonts.json'), 'utf8')) as { faces: { family: string; file: string }[] }).faces

test.describe('the front-page walk', () => {
  for (const [name, threeD] of [
    ['with the 3D pass drawn', true],
    ['with 3D off', false],
  ] as const) {
    test(`makes no request outside the origin, ${name}`, async ({ page, context, watch }) => {
      test.setTimeout(180_000)
      if (!threeD) await withSettings(context, { view3d: false })
      await open(page, '/')
      if (threeD) await settled3d(page)

      // Start service, play the first level, read its debrief, and, with 3D off, play on to the end card. A frame of the 3D pass takes a
      // software renderer most of a second, so the pass is walked through one level, and the four levels through the 2D pass.
      await front.start(page).focus()
      await page.keyboard.press('Enter')
      const levels = threeD ? ['Fill the rail'] : ['Fill the rail', 'A clip empties', 'Mind the gap', 'Your turn']
      for (const [index, title] of levels.entries()) {
        await expect(front.level(page)).toContainText(title)
        await playToTheDebrief(page)
        await expect(front.verdict(page)).toHaveText('Well fired.')
        if (index < levels.length - 1) {
          await page.getByRole('button', { name: /^Next: / }).focus()
          await page.keyboard.press('Enter')
        }
      }
      if (!threeD) await expect(page.getByText('The same night, served three ways')).toBeVisible()

      // The net was in place and the walk was real: the site's own files came, and among them the faces and, in 3D, the scene's chunks.
      expect(watch.requests.length, 'requests to the site').toBeGreaterThan(10)
      expect(watch.requests.filter((request) => request.endsWith('.woff2')).length, 'font files').toBeGreaterThan(0)
      expect(watch.requests.some((request) => /\/assets\/three-vendor-/.test(request)), '3D chunks loaded').toBe(threeD)
    })
  }
})

test.describe('the routes', () => {
  for (const route of ROUTES) {
    test(`${route} makes no request outside the origin`, async ({ page, context, watch }) => {
      test.setTimeout(120_000)
      // A level page whose scene this run does not look at (the full service's other levels) is visited in 2D, so it does not draw one for nothing.
      if (HAS_3D(route) && !SCENE_IN_RUN(route)) await withSettings(context, { view3d: false })
      await open(page, route)
      await page.waitForLoadState('networkidle')
      // A 3D pass loads its chunks and draws a first frame: all of it is part of the visit.
      if (SCENE_IN_RUN(route)) await expect(page.locator('[data-stage][data-stage-phase="live"]').first()).toBeAttached({ timeout: 60_000 })
      expect(watch.requests.length, 'requests to the site').toBeGreaterThan(3)
    })
  }

  test('the navigation and the footer lead to every page they name, by the router, and none reaches out', async ({ page, watch }) => {
    await open(page, '/')
    const links = await page.locator('header a[href^="/"], footer a[href^="/"]').evaluateAll((anchors) => [...new Set(anchors.map((anchor) => anchor.getAttribute('href') ?? ''))])
    // The primary navigation (§3.3) is the brand, Map, Play, Today, Receipts and Evidence; the footer adds About, Changes, Settings and Design.
    expect(links).toEqual(expect.arrayContaining(['/', '/map', '/play', '/today', '/receipts', '/evidence', '/about', '/changes', '/settings', '/design']))
    for (const href of links.filter((link) => link !== '/')) {
      await page.locator(`header a[href="${href}"], footer a[href="${href}"]`).first().click()
      await expect(page).toHaveURL(new RegExp(`${href}$`))
      await ready(page, href)
    }
    expect(watch.requests.length).toBeGreaterThan(10)
  })
})

test.describe('the faces', () => {
  test('every font that loads is one of public/fonts/fonts.json, from the site, and each is in use on the design page', async ({ page, context, watch }) => {
    await withSettings(context, { view3d: false })
    await open(page, '/design')
    await quiet(page)
    const loaded = await page.evaluate(() => [...document.fonts].filter((face) => face.status === 'loaded').map((face) => face.family.replace(/["']/g, '')))
    const requested = [...new Set(watch.requests.filter((request) => request.endsWith('.woff2')))]
    const declared = FACES.map((face) => `/fonts/${face.file}`)
    expect(requested.filter((request) => !declared.includes(request)), 'font files that fonts.json does not list').toEqual([])
    // The three faces that every page uses: the display face, the numerals, and the reading face.
    for (const family of ['Big Shoulders Display', 'Doto', 'Atkinson Hyperlegible']) {
      expect(loaded, `${family} loaded`).toContain(family)
      const files = FACES.filter((face) => face.family === family).map((face) => `/fonts/${face.file}`)
      expect(
        files.some((file) => requested.includes(file)),
        `one of ${family}'s files (${files.join(', ')}) was requested from the site`,
      ).toBe(true)
    }
  })
})

test.describe('the policy', () => {
  // The document of a route carries the policy: a pull request looks at the pull request's eight (`vite preview` answers every address
  // with the same index.html), and the nightly sweep at each document that prepare-pages writes, each with a head of its own.
  for (const route of NIGHTLY ? documentRoutes() : PR_ROUTES) {
    test(`${route}: the document carries the meta CSP right after <meta charset>, with connect-src 'self' and no 'unsafe-eval'`, async ({ page }) => {
      await open(page, route)
      const head = await page.evaluate(() => ({
        first: document.head.firstElementChild?.getAttribute('charset') ?? null,
        second: document.head.children[1]?.getAttribute('http-equiv') ?? null,
        policy: document.head.children[1]?.getAttribute('content') ?? '',
      }))
      expect(head.first?.toLowerCase(), 'the first element of <head>').toBe('utf-8')
      expect(head.second?.toLowerCase(), 'the element after <meta charset>').toBe('content-security-policy')
      expect(head.policy).toContain("connect-src 'self'")
      expect(head.policy).toContain("default-src 'self'")
      // 'wasm-unsafe-eval' is the forge's (§12) and is allowed to be there; the bare keyword, which lets script run strings, is not.
      expect(head.policy).not.toMatch(/'unsafe-eval'/)
      expect(head.policy).toContain("'wasm-unsafe-eval'")
    })
  }

  test('the browser enforces it: a fetch to another origin is refused by the policy, and a navigation to another origin by the net', async ({ page, watch }) => {
    await open(page, '/map')
    // The policy: the request is refused inside the browser, before it is a request, and the page is told.
    const outcome = await page.evaluate(() => fetch('https://example.invalid/pixel').then(() => 'sent', (error: Error) => error.name))
    expect(outcome).toBe('TypeError')
    // The page loads the ledger, and refuses nothing else: the one refusal is the fetch that was asked for.
    await expect.poll(() => watch.refused).toEqual([expect.stringMatching(/^connect-src https:\/\/example\.invalid\/pixel @\/map$/)])
    expect(watch.strays, 'the policy stops it before the net').toEqual([])
    // The net: a navigation is not governed by `connect-src`, so only the route that refuses other origins sees it.
    await page.goto('https://example.invalid/page').catch(() => undefined)
    expect(watch.strays).toEqual(['https://example.invalid/page'])
    // Both were provoked on purpose and have been seen: the spec's own net is told to forget them.
    watch.clear()
  })

  test('the policy refuses nothing on any route, the pages that load the ledger among them (D-059)', async ({ page, context, watch }) => {
    await withSettings(context, { view3d: false })
    const seen: Record<string, string[]> = {}
    for (const route of PR_ROUTES) {
      watch.clear()
      await open(page, route)
      await quiet(page)
      seen[route] = [...watch.refused]
    }
    expect(KNOWN_REFUSALS).toEqual([])
    expect(seen).toEqual(Object.fromEntries(PR_ROUTES.map((route) => [route, []])))
  })
})
