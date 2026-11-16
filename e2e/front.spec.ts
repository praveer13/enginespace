/*
 * W0-T18's acceptance checks for the front page, in Playwright's Chromium, on the built site (ARCHITECTURE §6.11):
 *
 *   1. With JavaScript disabled, `/` shows the heading, the promise and the poster.
 *   2. The LCP element is the heading or the poster, never the canvas (a PerformanceObserver from the document's start).
 *   3. CLS stays at or under 0.1 across the 2D-to-3D swap, on a laptop's box and on a phone's.
 *   4. With `saveData` emulated, or tier 0 forced, the 3D chunks are never requested.
 *   (5. verify:numbers on the page copy is tests/front/copy.test.ts.)
 *   And what the page promises beyond them: the page's rail is the 3D scene's rail, to the pixel; the signature interaction (a drag, a
 *   tap and a key hang tickets, the bell fires, the stub tears off and the tape prints); and nothing leaves the origin.
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
import { RAIL, TICKET, clipX } from '../src/games/loop/scene-layout'
import type { SceneHook } from '../src/scene/test-hook'
import { bannedOn } from './support/copy-scan'

interface Lcp {
  tag: string
  inHeading: boolean
  inPoster: boolean
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
/** The 3D chunks, by file: three and R3F, the scene, and its post-processing. */
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
    .filter(([key, chunk]) => key === 'src/games/loop/Scene3D.tsx' || chunk.name === 'three-vendor' || chunk.name === 'postfx')
    .map(([, chunk]) => `/${chunk.file}`)
  expect(chunks3d.length).toBe(3)
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
              inPoster: element?.closest('[data-front-poster]') !== null && element !== null,
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
const stage = (page: Page) => page.locator('[data-stage="front"]')
const waiting = (page: Page) => page.locator('[data-loop-controls] ul button:not([disabled])')

/** Waits until React has taken the root from the static shell. */
async function mounted(page: Page) {
  await page.waitForFunction(() => Object.keys(document.querySelector('section.es-front-service') ?? {}).some((key) => key.startsWith('__react')))
}

/** Waits until the 3D pass is drawn, the Stage says it is settled, and a beat more. */
async function swapped(page: Page) {
  await expect(stage(page)).toHaveAttribute('data-stage-phase', 'live', { timeout: 60_000 })
  await expect(stage(page)).toHaveAttribute('data-settled', 'true', { timeout: 60_000 })
  await page.waitForTimeout(1000)
}

test.describe('accept 1: with JavaScript disabled, `/` shows the heading, the promise and the poster', () => {
  for (const [width, height, orientation] of [
    [1440, 900, 'landscape'],
    [390, 844, 'portrait'],
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
      await expect(page.getByText('enginespace is a course on the internals of vLLM and SGLang, for engineers who finished kernelspace’s serving track.')).toBeVisible()
      await expect(page.getByText(/You run each mechanism, read the code that implements it, then prove it on a real GPU/)).toBeVisible()
      const poster = page.locator(`[data-front-poster] [data-orientation="${orientation}"] svg`)
      await expect(poster).toBeVisible()
      const box = await poster.boundingBox()
      expect(box?.width ?? 0).toBeGreaterThan(300)
      await expect(page.locator('[data-front-poster] svg')).toHaveCount(2)
      await context.close()
    })
  }
})

test.describe('accept 2 and 3: the largest paint is the heading, and nothing shifts across the swap to 3D', () => {
  for (const [width, height, tier] of [
    [1440, 900, 2],
    [390, 844, 1],
  ] as const) {
    test(`at ${width} × ${height}, tier ${tier}`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height })
      await page.goto(`${ORIGIN}/?es-tier=${tier}`)
      await mounted(page)
      await swapped(page)
      await expect(service(page)).toHaveAttribute('data-view', '3d')
      const lcp = await page.evaluate(() => window.__lcp ?? [])
      const cls = await page.evaluate(() => window.__cls ?? 0)
      console.log(`${width} × ${height}, T${tier}: LCP ${JSON.stringify(lcp.at(-1))} over ${lcp.length} entries; CLS ${cls.toFixed(4)} across the swap`)
      expect(lcp.length).toBeGreaterThan(0)
      const last = lcp.at(-1) as Lcp
      expect(last.inHeading || last.inPoster).toBe(true)
      expect(lcp.filter((entry) => entry.tag === 'CANVAS')).toEqual([])
      expect(cls).toBeLessThanOrEqual(0.1)
    })
  }
})

test.describe("the printer stands in a phone's first screen (W1b's finish review of Service, round 1)", () => {
  test('at 390 × 844 the whole housing, the mouth at its foot included, is above the fold', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${ORIGIN}/?es-tier=0`)
    await mounted(page)
    await page.evaluate(() => document.fonts.ready)
    for (const part of ['.es-front-printer', '.es-front-printer__mouth']) {
      const box = await page.locator(part).boundingBox()
      console.log(`390 × 844: ${part} from ${box?.y} to ${(box?.y ?? 0) + (box?.height ?? 0)} px`)
      expect(box, part).not.toBeNull()
      expect((box?.y ?? 0) + (box?.height ?? 0), part).toBeLessThanOrEqual(844)
    }
  })
})

test.describe('accept 4: the 3D chunks are never requested', () => {
  test('with data saver on, the pass offers 3D and loads none of it', async ({ page, requests }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'connection', {
        configurable: true,
        get: () => ({ saveData: true, effectiveType: '4g', addEventListener() {}, removeEventListener() {} }),
      })
    })
    await page.goto(`${ORIGIN}/?es-tier=2`)
    await mounted(page)
    await expect(page.locator('[data-note="save-data"]')).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(4000)
    const loaded = requests.filter((request) => chunks3d.includes(request))
    console.log(`data saver: ${requests.length} requests, 3D chunks among them: ${JSON.stringify(loaded)}`)
    expect(loaded).toEqual([])
  })

  test('at tier 0, the pass stays 2D and loads none of it', async ({ page, requests }) => {
    await page.goto(`${ORIGIN}/?es-tier=0`)
    await mounted(page)
    await page.waitForTimeout(5000)
    await expect(service(page)).toHaveAttribute('data-view', '2d')
    await expect(stage(page)).toHaveCount(0)
    expect(requests.filter((request) => chunks3d.includes(request))).toEqual([])
    await expect(page.getByRole('button', { name: '3D view' })).toBeDisabled()
  })
})

test.describe('the pass is one object', () => {
  test('the page\'s rail is the scene\'s rail: the 3D rail lands on the rail the order ticket hangs from', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto(`${ORIGIN}/?es-tier=2`)
    await mounted(page)
    await swapped(page)
    const projected = await page.evaluate(
      ([x, y, z]) => (window.__esScene as SceneHook).probes.front.project([x, y, z]),
      [clipX(0, 4) - TICKET.width, RAIL.y - 0.0175, RAIL.z] as const,
    )
    const canvas = await page.locator('[data-stage="front"] canvas').boundingBox()
    const rail = await page.locator('.es-front-rail').boundingBox()
    if (projected === null || canvas === null || rail === null) throw new Error('nothing to measure')
    const sceneRailY = canvas.y + projected.y
    const pageRailY = rail.y + rail.height / 2
    console.log(`the scene's rail at ${sceneRailY.toFixed(1)} px, the page's at ${pageRailY.toFixed(1)} px`)
    expect(Math.abs(sceneRailY - pageRailY)).toBeLessThan(3)

    // The pass has one printer, the page's: the scene draws no printer and no tickets on the counter of its own here. The printer's
    // column and the order ticket beside it leave the scene's first clip in the clear, and the scene keeps its last clip in the pass.
    // The scene's labels are DOM (D-021), so their boxes are measured, not guessed.
    await expect(page.locator('[data-stage="front"] .es-loop-label--waiting')).toHaveCount(0)
    const ticket = await page.locator('.es-front-ticket').boundingBox()
    const column = await page.locator('.es-front-expo').boundingBox()
    const firstClip = await page.locator('[data-stage="front"] .es-loop-label--empty').first().boundingBox()
    const lastClip = await page.locator('[data-stage="front"] .es-loop-label--empty').last().boundingBox()
    if (ticket === null || column === null || firstClip === null || lastClip === null) throw new Error('nothing to measure')
    console.log(`the printer's column ends at ${(column.x + column.width).toFixed(1)} px, the order ticket at ${(ticket.x + ticket.width).toFixed(1)} px; the first clip's stub starts at ${firstClip.x.toFixed(1)} px`)
    expect(column.x + column.width).toBeLessThanOrEqual(ticket.x)
    expect(ticket.x + ticket.width).toBeLessThanOrEqual(firstClip.x)
    expect(lastClip.x + lastClip.width).toBeLessThanOrEqual(1440)
  })

  test('the stations light with the fire: half a rail leaves half the line dark and the tape prints the dark stations, a full rail lights it end to end (the scene\'s stations are tests/play/loop-scene.test.ts)', async ({ page }) => {
    test.setTimeout(120_000)
    for (const [hung, lit] of [
      [2, 2],
      [4, 4],
    ] as const) {
      await page.goto(`${ORIGIN}/?es-tier=2`)
      await mounted(page)
      await swapped(page)
      await page.getByRole('button', { name: 'Start the demo' }).click()
      for (let n = 0; n < hung; n++) await waiting(page).first().click()
      // Before the bell the tape prints the next fire: the stations it will light, of the rail's four, and the step it will take.
      const tape = page.locator('.es-front-tape')
      const figures = (where: string) => tape.locator(`${where} data`)
      await expect(figures('.es-front-tape__next')).toHaveText([String(hung), '4', '8'])
      await page.getByRole('button', { name: /Step: run the next step/ }).click()
      // After it, the fire as the line cooked it: its ticks per step, the stations it lit, and the ones it left dark, in the red.
      await expect(figures('[data-line="ticks"]')).toHaveText(['8'])
      await expect(figures('[data-line="busy"]')).toHaveText([String(hung), '4'])
      await expect(figures('[data-line="dark"]')).toHaveText([String(4 - hung)])
      await expect(tape.locator('[data-line="dark"]')).toHaveAttribute('data-tone', hung < 4 ? 'ink-2' : 'ink')
      // The pips on the tape print the stations the fire lit, solid, and the ones it left dark, open.
      await expect(tape.locator('[data-line="busy"] .es-front-pips__pip[data-lit]')).toHaveCount(lit)
    }
  })
})

test.describe('the signature interaction', () => {
  test('the stub starts service; a drag, a tap and a key hang tickets; the bell fires; the tape prints', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto(`${ORIGIN}/?es-tier=0`)
    await mounted(page)
    // The stub: service starts, the stub tears off, the tape prints, and focus is on the first ticket.
    await page.getByRole('button', { name: 'Start the demo' }).click()
    await expect(page.getByRole('button', { name: 'Start the demo' })).toHaveCount(0)
    await expect(service(page)).toHaveAttribute('data-started', '')
    await expect(page.locator('.es-front-tape')).toBeVisible()
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Admit request R1 into a batch slot')

    // A drag onto the pass hangs ticket 01; a tap hangs 02; the key 1 hangs the first in line, 03.
    const first = await waiting(page).first().boundingBox()
    const pass = await page.locator('.es-front-pass__stage').boundingBox()
    if (first === null || pass === null) throw new Error('nothing to drag')
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2)
    await page.mouse.down()
    await page.mouse.move(first.x + first.width / 2, first.y - 40, { steps: 4 })
    await page.mouse.move(pass.x + pass.width * 0.7, pass.y + pass.height * 0.3, { steps: 6 })
    await expect(service(page)).toHaveAttribute('data-dragging', '')
    await page.mouse.up()
    await expect(page.getByRole('button', { name: 'Admit request R1 into a batch slot' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Admit request R2 into a batch slot' }).click()
    await expect(page.getByRole('button', { name: 'Admit request R2 into a batch slot' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Admit request R4 into a batch slot' }).focus()
    await page.keyboard.press('Digit1')
    await expect(page.getByRole('button', { name: 'Admit request R3 into a batch slot' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Admit request R4 into a batch slot' }).click()

    // The bell fires the step: the tape prints fire 0001 and its ticks, synthetic, and the level is over.
    await page.getByRole('button', { name: /Step: run the next step/ }).click()
    const tape = page.locator('.es-front-tape')
    await expect(tape).toContainText('0001')
    await expect(tape).toContainText('synthetic')
    // The order ticket prints a new stub for the debrief, in the first viewport; the deck says it too.
    const debrief = page.locator('.es-front-ticket').getByRole('button', { name: 'See the debrief' })
    await expect(debrief).toBeInViewport()
    await expect(page.locator('.es-front-deck').getByRole('button', { name: 'See the debrief' })).toHaveCount(1)
    await debrief.click()
    await expect(page.locator('[data-loop-debrief]')).toBeVisible()
    await page.getByRole('button', { name: /^Next:/ }).click()
    await expect(service(page)).toHaveAttribute('data-level', 'first-2-slot')
  })
})

test.describe('R-T14: the front page in the engine\'s words, and its first button does what it says', () => {
  test('no banned word or phrase reaches a learner: at rest, while playing a whole level, at its debrief, and in every live-region line', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto(`${ORIGIN}/?es-tier=0`)
    await mounted(page)
    expect(await bannedOn(page), 'at rest').toEqual([])
    await page.getByRole('button', { name: 'Start the demo' }).click()
    expect(await bannedOn(page), 'after the first button').toEqual([])
    const lines = page.locator('[data-live="line"]')
    for (let n = 0; n < 4; n++) {
      await waiting(page).first().click()
      expect(await bannedOn(page), `after admitting request ${n + 1}`).toEqual([])
    }
    await page.getByRole('button', { name: /Step: run the next step/ }).click()
    await expect(lines).toContainText('Step 1 ran')
    await expect(page.getByRole('button', { name: 'See the debrief' }).first()).toBeVisible()
    expect(await bannedOn(page), 'at the debrief').toEqual([])
    for (let level = 2; level <= 4; level++) {
      await page.getByRole('button', { name: /^Next:/ }).click()
      for (let turn = 0; turn < 60 && (await page.locator('[data-loop-debrief]').count()) === 0; turn++) {
        if ((await waiting(page).count()) > 0) await waiting(page).first().click()
        else await page.getByRole('button', { name: /Step: run the next step/ }).click()
      }
      await expect(page.locator('[data-loop-debrief]')).toBeVisible()
      expect(await bannedOn(page), `at the debrief of demo level ${level}`).toEqual([])
    }
  })

  test('the first button starts the demo and does nothing else; one link names TR1 lesson 1, its minutes and what it needs, inside the first viewport at 1440', async ({ page }) => {
    await page.goto(`${ORIGIN}/?es-tier=0`)
    await mounted(page)
    const start = page.getByRole('button', { name: 'Start the demo' })
    await expect(start).toBeVisible()
    const course = page.getByRole('link', { name: 'Begin the course: TR1 lesson 1, Five mechanisms (35 min, browser only)' })
    await expect(course).toHaveCount(1)
    await expect(course).toBeInViewport({ ratio: 1 })
    await expect(course).toHaveAttribute('href', '/m/tr1/l1-five-mechanisms')
    await start.click()
    // The demo has started: the page is where it was, and the first request waits to be admitted.
    expect(new URL(page.url()).pathname).toBe('/')
    await expect(service(page)).toHaveAttribute('data-started', '')
    await expect(page.getByRole('button', { name: 'Admit request R1 into a batch slot' })).toBeVisible()
    // Every other control of the first screen is named for what it does.
    const names = await page.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? ''))
    expect(names.filter((name) => /^(Start|Begin|Open)\b/.test(name))).toEqual([])
  })

  test('the header\'s Continue is on the page and reads from es:next, and the page opens no IndexedDB', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('es:next', JSON.stringify({ href: '/m/tr2/l1-one-step-five-calls', label: 'Continue: TR2 lesson 1, read why', word: 'Continue' }))
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
    const next = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Continue: TR2 lesson 1, read why' })
    await expect(next).toBeVisible()
    await expect(next).toHaveAttribute('href', '/m/tr2/l1-one-step-five-calls')
    expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual([])
  })
})
