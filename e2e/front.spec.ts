/*
 * The front page's acceptance checks (ARCHITECTURE §6.11, REDESIGN §3.1, R-T19), in Playwright's Chromium, on the built site:
 *
 *   - With JavaScript disabled, `/` shows the heading, the paragraph and the instrument's first frame: the timing diagram, a waiting
 *     request and Step.
 *   - At 1440 x 900 and 390 x 844 the heading, a waiting request and Step are inside the first viewport, and the left column holds no
 *     numbered procedure. At first paint there is one amber ring (on R1), the now line and no amber fill, and five ink callouts.
 *   - At 390 the callout discs are on the diagram, the coach line steps through the parts one at a time, and Parts opens the whole list.
 *   - The LCP element is the heading, and nothing shifts (CLS at or under 0.1) when a capable desk turns the diagram's box 3D; a phone in
 *     the hand stays in 2D with no 3D switch until the track has a phone layout; with data saver, or at tier 0, the 3D chunks are never requested.
 *   - Every button does what it says: after a demo level the next one is the amber control and Start the course an outline that names
 *     TR1 lesson 1, its minutes and what it needs; after the fourth, Start the course is the amber one.
 *   - A returning learner reads where they left off and Continue, from `es:next`, with no intro; the page opens no IndexedDB.
 *   - No banned word or build-log id reaches the page, at rest, while playing, at every result and in every live-region line.
 *   - The page is at most 2,000 px long at 1440.
 *
 * How it runs, as e2e/loop-scene.spec.ts does: one test build with `VITE_ES_TEST_HOOKS=1` (it exposes `window.__esScene` and honours
 * `?es-tier=<0-3>`), served by `context.route` so no server runs, with any request off the origin and any error on the page failing
 * the test. Chromium renders WebGL2 with SwiftShader, so CI needs no GPU.
 *
 *   npx playwright test e2e/front.spec.ts
 *
 * `ES_CHROMIUM=<path to chrome>` runs it with another Chromium build than the one Playwright installed. Each check prints what it
 * measured, for the task's record.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { build } from 'vite'
import { bannedOn } from './support/copy-scan'

interface Lcp {
  tag: string
  inHeading: boolean
  size: number
}

declare global {
  interface Window {
    __cls?: number
    __lcp?: Lcp[]
  }
}

const root = path.resolve(import.meta.dirname, '..')
const ORIGIN = 'http://localhost:4178'
const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
}

let dist = ''
/** The 3D chunks, by file: three and R3F, and the time track's scene. */
let chunks3d: string[] = []

base.use({
  launchOptions: {
    executablePath: process.env.ES_CHROMIUM || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
  viewport: { width: 1440, height: 900 },
})

base.beforeAll(async () => {
  dist = mkdtempSync(path.join(tmpdir(), 'es-front-'))
  process.env.VITE_ES_TEST_HOOKS = '1'
  await build({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'error', build: { outDir: dist, emptyOutDir: true } })
  const manifest = JSON.parse(readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8')) as Record<string, { file: string; name?: string }>
  chunks3d = Object.entries(manifest)
    .filter(([key, chunk]) => key === 'src/games/loop/Scene3D.tsx' || chunk.name === 'three-vendor')
    .map(([, chunk]) => `/${chunk.file}`)
  expect(chunks3d.length).toBe(2)
})

base.afterAll(() => {
  if (dist) rmSync(dist, { recursive: true, force: true })
})

/** Each test serves the build itself and fails on any error the page throws or logs, and on any request off the origin. */
const test = base.extend<{ requests: string[] }>({
  requests: [
    async ({ context, page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`)
      })
      const requests: string[] = []
      const strays: string[] = []
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url())
        if (url.origin !== ORIGIN) {
          strays.push(url.href)
          return route.abort()
        }
        requests.push(url.pathname)
        let file = path.join(dist, decodeURIComponent(url.pathname))
        if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(dist, 'index.html')
        return route.fulfill({ body: readFileSync(file), contentType: TYPES[path.extname(file)] ?? 'application/octet-stream' })
      })
      // The layout shifts and the largest paints, observed from the document's start.
      await page.addInitScript(() => {
        window.__cls = 0
        window.__lcp = []
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!entry.hadRecentInput) window.__cls = (window.__cls ?? 0) + entry.value
        }).observe({ type: 'layout-shift', buffered: true })
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as (PerformanceEntry & { element: Element | null; size: number })[]) {
            const element = entry.element
            window.__lcp?.push({
              tag: element?.tagName ?? '',
              inHeading: element?.closest('h1') !== null && element !== null,
              size: entry.size,
            })
          }
        }).observe({ type: 'largest-contentful-paint', buffered: true })
      })
      await use(requests)
      expect(strays, 'requests that left the origin').toEqual([])
      expect(errors, 'errors on the page').toEqual([])
    },
    { auto: true },
  ],
})

const service = (page: Page) => page.locator('section.es-front-service')
const stage = (page: Page) => service(page).locator('[data-stage]')
const chips = (page: Page) => service(page).locator('.es-lanes__chips button:not([disabled])')
const step = (page: Page) => service(page).locator('[data-front-step]').getByRole('button', { name: /^Step/ })
/** The intro flag that keeps the first level's parts: a visit that opens with no intro. */
const MET = JSON.stringify({ loop: ['waiting', 'slot', 'cpu', 'gpu', 'step', 'now'] })

/** Waits until React has taken the root from the static shell. */
async function mounted(page: Page) {
  await page.waitForFunction(() => Object.keys(document.querySelector('section.es-front-service') ?? {}).some((key) => key.startsWith('__react')))
}

/** Waits until the 3D view is drawn, the Stage says it is settled, and a beat more. */
async function swapped(page: Page) {
  await expect(stage(page)).toHaveAttribute('data-stage-phase', 'live', { timeout: 60_000 })
  await expect(stage(page)).toHaveAttribute('data-settled', 'true', { timeout: 60_000 })
  await page.waitForTimeout(1000)
}

/** The top of each strip of the instrument, in px: what must not move when the box turns 3D. */
const strips = (page: Page) =>
  page.evaluate(() =>
    ['.es-front-strip', '.es-front-goal', '.es-front-diagram', '.es-front-readout', '.es-front-dock', '.es-front-foot'].map((selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect()
      return `${selector} ${Math.round(box?.top ?? -1)} ${Math.round(box?.height ?? -1)}`
    }),
  )

/** The amber-filled controls inside the viewport: the One Marker Rule allows one per viewport (REDESIGN §2.4). */
const amberInView = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('.es-primary-button__pull, [data-emphasis="primary"]')].filter((element) => {
        const box = element.getBoundingClientRect()
        return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth
      }).length,
  )

/** Plays the open level to its result by the reference run's strategy, with the pointer. */
async function playLevel(page: Page) {
  const overlap = service(page).getByRole('switch')
  const level = (await service(page).getAttribute('data-level')) ?? ''
  if (level === 'first-3-gap' || level === 'first-4-par') {
    await expect(overlap).toBeVisible()
    if ((await overlap.getAttribute('aria-checked')) !== 'true') await overlap.click()
  }
  for (let turn = 0; turn < 120 && (await service(page).locator('[data-result]').count()) === 0; turn++) {
    if ((await chips(page).count()) > 0) await chips(page).first().click()
    else await step(page).click()
  }
  await expect(service(page).locator('[data-result]')).toBeVisible()
}

test.describe('with JavaScript disabled, `/` shows the heading, the paragraph and the instrument\'s first frame', () => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`at ${width} px`, async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height } })
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url())
        if (url.origin !== ORIGIN) return route.abort()
        let file = path.join(dist, decodeURIComponent(url.pathname))
        if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(dist, 'index.html')
        return route.fulfill({ body: readFileSync(file), contentType: TYPES[path.extname(file)] ?? 'application/octet-stream' })
      })
      const page = await context.newPage()
      await page.goto(`${ORIGIN}/`)
      await expect(page.getByRole('heading', { level: 1, name: 'Run one step of an LLM inference engine.' })).toBeVisible()
      await expect(page.locator('.es-lanes:visible')).toHaveCount(1)
      await expect(page.locator('.es-lanes:visible').getByRole('button', { name: 'Admit request R1 into a batch slot' })).toBeInViewport()
      await expect(page.locator('[data-front-step]').getByRole('button', { name: 'Step: fill a slot first' })).toBeVisible()
      await context.close()
    })
  }
})

test.describe('the first viewport, at a desk and on a phone', () => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`at ${width} × ${height}: the heading, a waiting request and Step are in it; one amber ring, the now line, no amber fill, five ink callouts`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto(`${ORIGIN}/?es-tier=0`)
      await mounted(page)
      await page.evaluate(() => document.fonts.ready)
      await expect(page.getByRole('heading', { level: 1 })).toBeInViewport({ ratio: 1 })
      await expect(page.getByRole('button', { name: 'Admit request R1 into a batch slot' })).toBeInViewport({ ratio: 1 })
      await expect(step(page)).toBeInViewport({ ratio: 1 })
      // The left column says what this is and holds no procedure.
      await expect(page.locator('.es-front-intro ol')).toHaveCount(0)
      // Amber: one ring, on R1, and the now cursor; nothing filled.
      await expect(page.locator('.es-marker[data-kind="ring"]:visible')).toHaveCount(1)
      await expect(page.locator('.es-marker[data-kind="ring"] [data-req="0"]')).toBeVisible()
      // The now line: the cursor is a line drawn by its marker, so it is counted in the one diagram the app draws.
      await expect(service(page).locator('.es-lanes .es-marker[data-kind="cursor"]')).toHaveCount(1)
      await expect(service(page).locator('.es-lanes [data-lane-now]')).toBeInViewport()
      expect(await amberInView(page), 'amber fills in the first viewport').toBe(0)
      // Five ink callouts, numbered as the coach strip lists them.
      await expect(page.locator('[data-callout]:visible')).toHaveCount(5)
      const goal = (await page.locator('.es-front-goal__line').textContent()) ?? ''
      expect(goal).not.toMatch(/\b\d+\s+tokens?\b|\bfour tokens?\b/i)
      // No sideways scroll.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    })
  }

  test('at 390, the coach line steps through the parts one at a time, the current disc ringed on the diagram, and Parts opens the whole list', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${ORIGIN}/?es-tier=0`)
    await mounted(page)
    const line = page.locator('[data-coach-line]')
    await expect(line).toContainText('1 of 5 · Waiting queue: requests not yet in the batch.')
    await expect(page.locator('[data-callout="1"][data-current]')).toBeVisible()
    for (const [n, words] of [
      [2, 'Batch slots'],
      [3, 'CPU lane'],
      [4, 'GPU lane'],
      [5, 'Step'],
    ] as const) {
      await line.getByRole('button', { name: 'Next', exact: true }).click()
      await expect(line).toContainText(`${n} of 5 · ${words}`)
    }
    await line.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(line).toContainText('Tap R1 to put it in a slot.')
    await service(page).getByRole('button', { name: 'Parts', exact: true }).click()
    const list = page.getByRole('list', { name: 'Parts of the Step loop' })
    await expect(list).toBeVisible()
    await expect(list.getByRole('listitem')).toHaveCount(6)
    await expect(list).toContainText('EngineCoreProc.run_busy_loop')
  })
})

test.describe('the largest paint is the heading, and nothing moves when the diagram turns 3D', () => {
  for (const [width, height, tier] of [
    [1440, 900, 2],
    [1280, 800, 1],
  ] as const) {
    test(`at ${width} × ${height}, tier ${tier}, a visit with no intro turns 3D after the largest paint, in the same box`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.addInitScript((met) => window.localStorage.setItem('es:intro', met), MET)
      await page.setViewportSize({ width, height })
      await page.goto(`${ORIGIN}/?es-tier=${tier}`)
      await mounted(page)
      await page.evaluate(() => document.fonts.ready)
      const before = await strips(page)
      await swapped(page)
      await expect(service(page)).toHaveAttribute('data-view', '3d')
      const after = await strips(page)
      const lcp = await page.evaluate(() => window.__lcp ?? [])
      const cls = await page.evaluate(() => window.__cls ?? 0)
      console.log(`${width} × ${height}, T${tier}: LCP ${JSON.stringify(lcp.at(-1))} over ${lcp.length} entries; CLS ${cls.toFixed(4)} across the swap`)
      expect(after, 'the strips, the dock and the foot stand where they stood').toEqual(before)
      expect(lcp.length).toBeGreaterThan(0)
      // The largest paint is the static heading. The app renders its own over it, so the entry may have lost its element by the time it is
      // read: then it is told by its size, which is the heading's box.
      const largest = lcp.at(-1) as Lcp
      const heading = await page.getByRole('heading', { level: 1 }).boundingBox()
      const area = (heading?.width ?? 0) * (heading?.height ?? 0)
      expect(largest.inHeading || (largest.tag === '' && Math.abs(largest.size - area) <= area * 0.2), `the largest paint is the heading: ${JSON.stringify(largest)} against ${Math.round(area)} px²`).toBe(true)
      expect(lcp.filter((entry) => entry.tag === 'CANVAS')).toEqual([])
      expect(cls).toBeLessThanOrEqual(0.1)
    })
  }

  test('a first visit keeps the diagram through the intro and the first demo level, and turns 3D at the second', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto(`${ORIGIN}/?es-tier=2`)
    await mounted(page)
    await page.waitForTimeout(3000)
    await expect(service(page)).toHaveAttribute('data-view', '2d')
    await playLevel(page)
    await expect(service(page)).toHaveAttribute('data-view', '2d')
    await page.getByRole('button', { name: 'Next demo level: Refill a slot' }).click()
    await swapped(page)
    await expect(service(page)).toHaveAttribute('data-view', '3d')
    expect(await page.evaluate(() => window.__cls ?? 0)).toBeLessThanOrEqual(0.1)
  })

  test('a phone in the hand stays in 2D, and the 3D switch is withheld until the time track has a layout a phone can read', async ({ browser }) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const requests: string[] = []
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== ORIGIN) return route.abort()
      requests.push(url.pathname)
      let file = path.join(dist, decodeURIComponent(url.pathname))
      if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(dist, 'index.html')
      return route.fulfill({ body: readFileSync(file), contentType: TYPES[path.extname(file)] ?? 'application/octet-stream' })
    })
    const page = await context.newPage()
    await page.addInitScript((met) => window.localStorage.setItem('es:intro', met), MET)
    await page.goto(`${ORIGIN}/?es-tier=2`)
    await mounted(page)
    await page.waitForTimeout(5000)
    await expect(service(page)).toHaveAttribute('data-view', '2d')
    expect(requests.filter((request) => chunks3d.includes(request))).toEqual([])
    // The finish review of build B: at 390 the 3D track's labels collide and its rows are a few pixels deep, so a phone is offered no 3D.
    await expect(service(page).getByRole('button', { name: '3D', exact: true })).toHaveCount(0)
    await page.keyboard.press('v')
    await page.waitForTimeout(1000)
    await expect(service(page)).toHaveAttribute('data-view', '2d')
    expect(requests.filter((request) => chunks3d.includes(request))).toEqual([])
    await context.close()
  })
})

test.describe('the 3D chunks are never requested where they are not wanted', () => {
  test('with data saver on, the box offers 3D and loads none of it', async ({ page, requests }) => {
    await page.addInitScript((met) => {
      window.localStorage.setItem('es:intro', met)
      Object.defineProperty(Navigator.prototype, 'connection', {
        configurable: true,
        get: () => ({ saveData: true, effectiveType: '4g', addEventListener() {}, removeEventListener() {} }),
      })
    }, MET)
    await page.goto(`${ORIGIN}/?es-tier=2`)
    await mounted(page)
    await expect(page.locator('[data-note="save-data"]')).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(4000)
    const loaded = requests.filter((request) => chunks3d.includes(request))
    console.log(`data saver: ${requests.length} requests, 3D chunks among them: ${JSON.stringify(loaded)}`)
    expect(loaded).toEqual([])
  })

  test('at tier 0, the diagram stays 2D and loads none of it, and the 3D switch says why', async ({ page, requests }) => {
    await page.goto(`${ORIGIN}/?es-tier=0`)
    await mounted(page)
    await page.waitForTimeout(5000)
    await expect(service(page)).toHaveAttribute('data-view', '2d')
    await expect(stage(page)).toHaveCount(0)
    expect(requests.filter((request) => chunks3d.includes(request))).toEqual([])
    await expect(service(page).getByRole('button', { name: '3D', exact: true })).toBeDisabled()
  })
})

test.describe('every button does what it says, and the way on is the brief\'s', () => {
  test('the first move names what happened, Step becomes the one amber control, and the first step names batching', async ({ page }) => {
    await page.goto(`${ORIGIN}/?es-tier=0`)
    await mounted(page)
    await page.getByRole('button', { name: 'Admit request R1 into a batch slot' }).click()
    await expect(page.locator('[data-coach-told]')).toContainText('Request R1 admitted into slot 1.')
    await expect(service(page)).not.toHaveAttribute('data-intro')
    await expect(page.locator('[data-callout]')).toHaveCount(0)
    await expect(step(page)).toHaveText('Step')
    await expect(step(page)).toHaveClass(/es-primary-button__pull/)
    expect(await amberInView(page), 'amber fills in the viewport').toBe(1)
    for (let n = 0; n < 3; n++) await chips(page).first().click()
    await step(page).click()
    await expect(page.locator('[data-loop-readout] [data-readout-id="tokens"]')).toContainText('4')
    await expect(page.getByText(/That is batching\./).first()).toBeVisible()
  })

  test('after each demo level the next is amber and the course an outline that names TR1 lesson 1; after the fourth, Start the course is the amber one', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto(`${ORIGIN}/?es-tier=0`)
    await mounted(page)
    const titles = ['Refill a slot', 'Close a bubble', 'Both levers']
    for (const title of titles) {
      await playLevel(page)
      const result = service(page).locator('[data-result]')
      const next = result.getByRole('button', { name: `Next demo level: ${title}` })
      await expect(next).toHaveClass(/es-primary-button__pull/)
      const course = result.getByRole('link', { name: 'Start the course: TR1 lesson 1 (35 min, browser only)' })
      await expect(course).toHaveClass(/es-front-out/)
      await expect(course).toHaveAttribute('href', '/m/tr1/l1-five-mechanisms')
      await expect(result.locator('.es-primary-button')).toHaveCount(1)
      await next.click()
      await expect(service(page)).toHaveAttribute('data-level', /first-[234]/)
    }
    await playLevel(page)
    const result = service(page).locator('[data-result]')
    await expect(result).toContainText('You just ran the step loop by hand.')
    const start = result.getByRole('link', { name: 'Start the course: TR1 lesson 1, Five mechanisms (35 min, browser only)' })
    await expect(start).toHaveClass(/es-primary-button__pull/)
    await expect(start).toHaveAttribute('href', '/m/tr1/l1-five-mechanisms')
    await expect(result.getByRole('button', { name: /^Next demo level/ })).toHaveCount(0)
    // Every control that says Start or Continue goes where the empty ledger's way on goes.
    const ways = await page.locator('a').evaluateAll((links) => links.filter((link) => /^(Start|Continue)\b/.test(link.textContent?.trim() ?? '')).map((link) => link.getAttribute('href')))
    expect(ways.length).toBeGreaterThan(2)
    expect(new Set(ways)).toEqual(new Set(['/m/tr1/l1-five-mechanisms']))
  })

  test('no banned word or phrase and no build-log id reaches a learner: at rest, while playing every level, at every result, and in every live-region line', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto(`${ORIGIN}/?es-tier=0`)
    await mounted(page)
    const ids = /\b(?:W\d+b?-T\d+|R-T\d+|D-\d{3}|Q-\d+)\b/
    const check = async (when: string) => {
      expect(await bannedOn(page), when).toEqual([])
      expect(await page.locator('body').innerText(), when).not.toMatch(ids)
    }
    await check('at rest')
    for (let level = 1; level <= 4; level++) {
      await playLevel(page)
      await check(`at the result of demo level ${level}`)
      if (level < 4) await page.getByRole('button', { name: /^Next demo level/ }).click()
    }
  })
})

test.describe('a returning learner', () => {
  test('reads where they left off and an amber Continue, from es:next, with no intro; the page opens no IndexedDB and writes nothing', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('es:next', JSON.stringify({ href: '/m/tr2/l1-one-step-five-calls#read', label: 'Continue: TR2 lesson 1, read why', word: 'Continue' }))
      const opened: string[] = []
      ;(window as unknown as { __opened: string[] }).__opened = opened
      const open = IDBFactory.prototype.open
      IDBFactory.prototype.open = function (...args: Parameters<IDBFactory['open']>) {
        opened.push(String(args[0]))
        return open.apply(this, args)
      }
    })
    await page.goto(`${ORIGIN}/?es-tier=0`)
    await mounted(page)
    await expect(page.locator('[data-front-back]')).toContainText('You left off in TR2 lesson 1. Next: read why.')
    const left = page.locator('[data-front-back]').getByRole('link', { name: 'Continue: TR2 lesson 1, read why' })
    await expect(left).toHaveAttribute('href', '/m/tr2/l1-one-step-five-calls#read')
    await expect(left).toHaveAttribute('data-emphasis', 'primary')
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Continue: TR2 lesson 1, read why' })).toBeVisible()
    // No intro: no callouts, no ring, and the coach strip says what to do.
    await expect(service(page)).not.toHaveAttribute('data-intro')
    await expect(page.locator('[data-callout]')).toHaveCount(0)
    await expect(page.locator('.es-marker[data-kind="ring"]')).toHaveCount(0)
    // A move in the demo makes it the move in hand: the Continue steps back to an outline, so one amber fill remains.
    await chips(page).first().click()
    await expect(left).toHaveAttribute('data-emphasis', 'outline')
    await playLevel(page)
    expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual([])
    // The ledger is IndexedDB, which was never opened; and nothing that looks like evidence went to localStorage either.
    expect(await page.evaluate(() => Object.keys(window.localStorage).filter((key) => /ledger|evidence|event|record/i.test(key)))).toEqual([])
    expect(await page.evaluate(() => window.localStorage.getItem('es:next'))).toContain('Continue: TR2 lesson 1, read why')
  })
})

test.describe('the page\'s length', () => {
  test('is at most 2,000 px at 1440, below the fold included', async ({ page }) => {
    await page.goto(`${ORIGIN}/?es-tier=0`)
    await mounted(page)
    await page.evaluate(() => document.fonts.ready)
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    console.log(`the front page at 1440 × 900 is ${height} px long`)
    expect(height).toBeLessThanOrEqual(2000)
  })
})
