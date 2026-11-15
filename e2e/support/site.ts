/*
 * What the W0-T21 specs share: a test that watches the origin, and the few moves that every spec makes on the built site.
 *
 * `test` is Playwright's, with one automatic fixture, `watch`. Whatever a spec does, it fails when
 *   - a request leaves the origin: the request is refused here, so that nothing reaches a third party from a run, and it is listed
 *     (ARCHITECTURE §1 I1, §12: "an e2e test asserts that every request goes to the origin");
 *   - the browser says that the page's own policy refused something (the meta CSP of §12): a `securitypolicyviolation` event, the
 *     structured form of the message that the console prints;
 *   - the page throws, or logs an error.
 * So every spec of the smoke subset is also a network check over the pages it visits, and none can pass over a policy that has gone
 * wrong. e2e/network.spec.ts is the one that says so out loud, and proves that the net can catch.
 *
 * The specs reach the site through the config's `baseURL` (`vite preview` over a fresh build), so a route is a path: `open(page, '/map')`.
 */
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { test as base, expect } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { GAMES } from '../../packages/play/registry'
import { DEFAULT_SETTINGS, encodeMirror, MIRROR_KEY } from '../../src/settings/model'
import type { Settings } from '../../src/settings/model'

export { expect }

/** The nightly sweep (nightly.yml): every document of the site, at the nightly widths. playwright.config.ts reads the same variable. */
export const NIGHTLY = process.env.ES_E2E_NIGHTLY === '1'

const root = path.resolve(import.meta.dirname, '../..')

/* ------------------------------------------------------------------------------------------------------------------ */
/* The watch                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * What the policy may refuse without failing a spec: nothing. Anything it refuses fails the spec that saw it.
 *
 * Until D-059 the list had one entry. zod, which the ledger's codec and every schema use, asked once whether `new Function('')` works, to
 * choose between a compiled and a plain way of parsing (zod 4.3.5, core `allowsEval`, called when the first object schema is built); the
 * policy has no 'unsafe-eval' (§12), so the browser reported one violation on every page that loads the ledger. The W0 exit review pinned
 * it to /settings and /evidence, and W1 let it onto /today, the course map and every module's page as they came to read the learner's
 * events. packages/schema/zod.ts now builds every schema jitless, so zod never asks, and no page refuses anything.
 */
export const KNOWN_REFUSALS: readonly { pattern: RegExp; why: string }[] = []

export interface Watch {
  /** Requests to anywhere but the site's origin. Each was refused. */
  readonly strays: string[]
  /** What the page's policy refused, as `<directive> <what was blocked> @<the page's path>`. KNOWN_REFUSALS lists the ones that do not fail. */
  readonly refused: string[]
  /** What the page threw or logged as an error. */
  readonly errors: string[]
  /** The paths that the site was asked for, in order. */
  readonly requests: string[]
  /** Forgets all four lists: for a test that provokes one of them on purpose, and has said so with an assertion. */
  clear(): void
}

declare global {
  interface Window {
    __esRefused?: (what: string) => void
  }
}

export const test = base.extend<{ watch: Watch }>({
  watch: [
    async ({ context, baseURL }, use) => {
      if (baseURL === undefined) throw new Error('these specs need a baseURL: run them through playwright.config.ts')
      const origin = new URL(baseURL).origin
      const watch: Watch = { strays: [], refused: [], errors: [], requests: [], clear: () => undefined }
      watch.clear = () => {
        for (const list of [watch.strays, watch.refused, watch.errors, watch.requests]) list.length = 0
      }

      // A request that leaves the origin never leaves the machine either: it is listed and refused.
      await context.route(
        (url) => /^https?:$/.test(url.protocol) && url.origin !== origin,
        (route) => {
          watch.strays.push(route.request().url())
          return route.abort('blockedbyclient')
        },
      )
      context.on('request', (request) => {
        const url = new URL(request.url())
        if (url.origin === origin) watch.requests.push(url.pathname)
      })

      // The policy's own report. The page tells the test through a binding, which a policy cannot block, and which survives a navigation.
      await context.exposeFunction('__esRefused', (what: string) => void watch.refused.push(what))
      await context.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__esRefused?.(`${event.violatedDirective} ${event.blockedURI} @${location.pathname}`)
        })
      })

      const attach = (tab: Page) => {
        tab.on('pageerror', (error) => watch.errors.push(`pageerror: ${error.message}`))
        tab.on('console', (message) => {
          // Warnings are not this page's errors: three's own notice that one of its classes is deprecated is one. `THREE.Clock: This module has
          // been deprecated` (three 0.185.1, since r183) is printed on /, /design and the four 3D games, as each makes its Canvas, by
          // @react-three/fiber 9.6.1, which makes a clock in the store of every Canvas (`clock: new THREE.Clock()`, its events-*.js). None of
          // this repository's code makes one [measured 2026-11-09 at 1cc66d4 by a stack taken where the warning is printed, and by grep], so it
          // stays until the dependency moves to THREE.Timer (W1b-T09).
          if (message.type() === 'error') watch.errors.push(`console: ${message.text()}`)
        })
      }
      context.pages().forEach(attach)
      context.on('page', attach)

      await use(watch)

      expect(watch.strays, 'requests that left the origin (refused)').toEqual([])
      expect(
        watch.refused.filter((what) => !KNOWN_REFUSALS.some((known) => known.pattern.test(what))),
        "what the page's content security policy refused",
      ).toEqual([])
      expect(watch.errors, 'errors on the page').toEqual([])
    },
    // Every spec gets the net, whether or not it reads it.
    { auto: true },
  ],
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Settings                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The learner's settings, in place before the first script of every page of this context runs: the copy in `localStorage` that the
 * front page and every game read at first paint (src/settings/model.ts). It is how a spec turns 3D off, so that a screenshot or an
 * audit sees the 2D pass and nothing moves under it, with the learner's own control and not a test hook.
 */
export async function withSettings(context: BrowserContext, patch: Partial<Settings>): Promise<void> {
  const copy = encodeMirror({ ...DEFAULT_SETTINGS, ...patch })
  await context.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value)
      } catch {
        // A page that cannot keep a setting simply runs with the defaults.
      }
    },
    [MIRROR_KEY, copy] as const,
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Opening a page                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** True when React has taken the front page's root from the static HTML that the build wrote (the poster, the heading, the stub). */
async function frontMounted(page: Page): Promise<void> {
  await page.waitForFunction(() => Object.keys(document.querySelector('section.es-front-service') ?? {}).some((key) => key.startsWith('__react')))
}

/**
 * Waits until the route's page has drawn: the front page's static shell is replaced by the app, and any other route (which
 * `vite preview` answers with the same index.html, whose shell is the front page's) has swapped that for its own `<h1>`.
 */
export async function ready(page: Page, route: string): Promise<void> {
  if (route === '/') await frontMounted(page)
  else {
    await page.waitForFunction(() => {
      const main = document.querySelector('main')
      const loading = [...document.querySelectorAll('[role="status"]')].some((status) => status.textContent?.trim().startsWith('Loading'))
      return main !== null && main.querySelector('.es-front') === null && main.querySelector('h1') !== null && !loading
    })
  }
  // The faces are in, so that text measures and contrasts as the learner sees it.
  await page.evaluate(() => document.fonts.ready)
}

export async function open(page: Page, route: string): Promise<void> {
  await page.goto(route)
  await ready(page, route)
}

/**
 * Waits until the page has stopped changing: no change to the DOM for `ms`, at most `cap` in all. Entrances, lazy chunks and a
 * scene's labels settle on their own time, and an audit or a screenshot taken in the middle of one sees half a page.
 */
export async function quiet(page: Page, ms = 500, cap = 20_000): Promise<void> {
  await page.evaluate(
    ([quietFor, limit]) =>
      new Promise<void>((resolve) => {
        let timer = window.setTimeout(done, quietFor)
        const hard = window.setTimeout(done, limit)
        const observer = new MutationObserver(() => {
          window.clearTimeout(timer)
          timer = window.setTimeout(done, quietFor)
        })
        observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true })
        function done() {
          window.clearTimeout(timer)
          window.clearTimeout(hard)
          observer.disconnect()
          resolve()
        }
      }),
    [ms, cap] as const,
  )
  // Finite animations (an entrance, the bell's strike) run to their end; the infinite ones (a printer's dots) are the page's resting state.
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running' || !Number.isFinite(animation.effect?.getComputedTiming().endTime ?? Number.POSITIVE_INFINITY)),
  )
}

/**
 * Waits for the 3D pass to be drawn: a Stage says it is live (src/scene/Stage.tsx), its 2D twin has left, and the page has stopped
 * changing. A page whose scene keeps moving by design (the specimen on /design never rests) passes `rested: false`, and one whose scene
 * comes to rest (a game's) is waited for until it does. The page must have a Stage: a page that has none fails here, with that said.
 */
export async function settled3d(page: Page, { rested = true, timeout = 60_000 }: { rested?: boolean; timeout?: number } = {}): Promise<void> {
  await expect(page.locator('[data-stage]').first(), 'a 3D pass was expected on this page').toBeAttached({ timeout })
  const live = rested ? '[data-stage][data-stage-phase="live"][data-settled="true"]' : '[data-stage][data-stage-phase="live"]'
  await expect(page.locator(live).first(), 'the 3D pass never went live (and rested)').toBeAttached({ timeout })
  await expect(page.locator('.es-stage__twin[data-leaving]')).toHaveCount(0, { timeout })
  await quiet(page)
}

/** The pages of the games that have a 3D scene, from the registry: a game that adds one is checked without anyone adding it to a list. */
const GAME_PAGES_3D: ReadonlySet<string> = new Set(GAMES.games.filter((game) => game.has3d).map((game) => `/play/${game.id}`))

/** The routes that draw a 3D pass on a device that can (A§3.1): the front page, the design page, and the page of every game with a scene. A `?level=` does not change that. */
export const HAS_3D = (route: string): boolean => {
  const [pathname] = route.split('?')
  return pathname === '/' || pathname === '/design' || GAME_PAGES_3D.has(pathname)
}

/**
 * Whether a run looks at the 3D pass of a route. Every route that has one, except that a pull request takes one of the five levels of
 * the full service, which share a scene: `graphs`, with the comb and the mold rack on the pass. The nightly sweep takes all five.
 */
export const SCENE_IN_RUN = (route: string): boolean => HAS_3D(route) && (NIGHTLY || !route.includes('?level=') || route.endsWith('?level=graphs'))

/* ------------------------------------------------------------------------------------------------------------------ */
/* Every document of a build                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The address of every document that prepare-pages left in dist/, which is every route it can enumerate (ARCHITECTURE §3.2): `/`,
 * `/m/tr2`, `/play/loop`. The nightly sweep visits all of them, so a page added to the plan is audited the night after, without
 * anyone adding it to a list. The config builds the site and runs prepare-pages first when ES_E2E_NIGHTLY is set.
 */
export function documentRoutes(): string[] {
  const dist = path.join(root, 'dist')
  if (!existsSync(path.join(dist, 'index.html'))) throw new Error('dist/ has no build: the nightly sweep lists the documents that prepare-pages wrote there')
  const routes = (readdirSync(dist, { recursive: true }) as string[])
    .filter((file) => file === 'index.html' || file.endsWith('/index.html'))
    .map((file) => (file === 'index.html' ? '/' : `/${file.slice(0, -'/index.html'.length)}`))
    .sort()
  if (routes.length < 20) throw new Error(`dist/ holds ${routes.length} documents: run bun scripts/prepare-pages.ts after the build, so that every route has one`)
  return routes
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reflow                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Clipped {
  /** The page's own horizontal overflow, which a `scrollWidth` check sees, in CSS px. */
  scrolls: number
  /** The text that sits past the right edge of the viewport and that nothing lets the reader scroll to. */
  text: string[]
}

/**
 * WCAG 1.4.10 (Reflow): at 320 px the page needs no sideways scroll, and nothing is cut off. A `scrollWidth` check (kernelspace's
 * a11y.mjs does that one) misses a page whose root clips, which is how this one found the debrief cut off at 360 px, so the second
 * half looks at the text itself: an element with words of its own, past the right edge, outside every box that scrolls sideways
 * (a table in a focusable region is allowed to) and outside every box that clips to a pixel (a live region for a reader). The 2D page only:
 * a 3D scene's labels may lie past its own edge by design. `within` is a selector for the part of the page to look at, for a check that
 * is about one piece of it.
 */
export function clipped(page: Page, within = 'body'): Promise<Clipped> {
  return page.evaluate((selector) => {
    const edge = document.documentElement.clientWidth
    const inScroller = (element: Element) => {
      for (let parent = element.parentElement; parent !== null && parent !== document.documentElement; parent = parent.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(parent).overflowX)) return true
      }
      return false
    }
    // Text inside a box that clips it to a pixel is not on the screen: a game's live region for a reader (`sr-only`) is such a box, and the
    // line it holds is as long as the turn's announcement (1,600 px wide in the 3D view of the Reach-In, which says several things at once
    // [measured 2026-11-08 at df76ca9, at 320 px]), so that its box ends past the edge although no pixel of it is drawn.
    const inPixel = (element: Element) => {
      for (let parent = element.parentElement; parent !== null && parent !== document.documentElement; parent = parent.parentElement) {
        const rect = parent.getBoundingClientRect()
        if (rect.width <= 1 && rect.height <= 1 && getComputedStyle(parent).overflowX !== 'visible') return true
      }
      return false
    }
    const text: string[] = []
    for (const element of document.querySelector(selector)?.querySelectorAll('*') ?? []) {
      if (![...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '')) continue
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      // Visually hidden text (a skip link before it is focused, a label for a reader) is a box of 1 px, or not drawn.
      if (box.width <= 1 || box.height <= 1 || style.visibility === 'hidden' || style.display === 'none') continue
      if (box.right <= edge + 1 || inScroller(element) || inPixel(element)) continue
      const name = `${element.tagName.toLowerCase()}${typeof element.className === 'string' && element.className !== '' ? `.${element.className.split(' ')[0]}` : ''}`
      text.push(`${name} ends at ${Math.round(box.right)} px, past the ${edge} px viewport: "${(element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`)
    }
    return { scrolls: document.documentElement.scrollWidth - edge, text }
  }, within)
}
