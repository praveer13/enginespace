/*
 * Scene kit v1's acceptance checks, in Playwright's Chromium, through the kitchen specimen on /design (src/scene/KitchenSpecimen.tsx):
 *
 *   1. Every piece and the assembled pass go live at T1 and at T2 (forced tiers), and draw within the specimen's budget: at most 16
 *      scene draw calls at T1 and 48 at T2, against A§11.1's 100 [estimated]. The figures are printed [measured].
 *   2. T1 keeps the props, their occlusion and their contact shadows, and draws no shadow map, no bloom, no light cone and no steam;
 *      T2 adds the heat lamps' shadow maps, bloom, the cones and the steam.
 *   3. Under reduced motion a bell changes the kitchen in place: no animation frame is requested once it has settled again.
 *   4. The page holds one live canvas: scrolling to the kitchen opens it, and the kit's specimen above shows its 2D twin meanwhile.
 *   5. With WebGL off, the kitchen's Stage shows its 2D note, a drawing of the piece, and nothing of three is fetched.
 *
 * Like e2e/scene-kit.spec.ts, the spec builds the app once with `VITE_ES_TEST_HOOKS=1` (window.__esScene and `?es-tier`), and
 * answers every request from that build, failing on any request that leaves the origin and on any error the page logs.
 *
 *   ES_CHROMIUM=<a Chromium that starts here> npx playwright test e2e/kitchen.spec.ts --workers=2
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test as base, expect, type Page } from '@playwright/test'
import { build } from 'vite'
import { SUBJECTS } from '../src/scene/kitchen-specimen'
import type { FrameStats } from '../src/scene/stage-runtime'

declare global {
  interface Window {
    __raf?: number
    __rafWaiting?: Set<number>
  }
}

const root = path.resolve(import.meta.dirname, '..')
const ORIGIN = 'http://localhost:4176'
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.txt': 'text/plain' }
/** The specimen's draw-call budget, by tier [estimated]: A§11.1's ceiling is 100. */
const BUDGET = { 1: 16, 2: 48 } as const

let dist = ''

base.use({
  launchOptions: { executablePath: process.env.ES_CHROMIUM || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  viewport: { width: 1280, height: 900 },
})

base.beforeAll(async () => {
  dist = mkdtempSync(path.join(tmpdir(), 'es-kitchen-'))
  process.env.VITE_ES_TEST_HOOKS = '1'
  await build({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'error', build: { outDir: dist, emptyOutDir: true } })
})

base.afterAll(() => {
  if (dist) rmSync(dist, { recursive: true, force: true })
})

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
      await use(requests)
      expect(strays, 'requests that left the origin').toEqual([])
      expect(errors, 'errors on the page').toEqual([])
    },
    { auto: true },
  ],
})

const kitchen = (page: Page) => page.locator('[data-stage="kitchen"]')
const probe = (page: Page) => page.evaluate(() => window.__esScene?.probes.kitchen?.info() ?? null)

async function openKitchen(page: Page, query = '') {
  await page.goto(`${ORIGIN}/design${query}`)
  await page.evaluate(() => document.fonts.ready)
  await page.locator('#scene-kitchen').scrollIntoViewIfNeeded()
  await kitchen(page).scrollIntoViewIfNeeded()
}

/** Waits until the kitchen is drawn and settled, and no frame has been drawn for half a second. */
async function settle(page: Page) {
  await expect(kitchen(page)).toHaveAttribute('data-stage-phase', 'live', { timeout: 30_000 })
  await expect(kitchen(page)).toHaveAttribute('data-settled', 'true', { timeout: 30_000 })
  let frames = -1
  await expect
    .poll(
      async () => {
        const now = (await probe(page))?.frames ?? -2
        const still = now === frames
        frames = now
        return still
      },
      { intervals: [500], timeout: 30_000 },
    )
    .toBe(true)
}

const frame = (page: Page): Promise<FrameStats> => page.evaluate(() => window.__esScene!.probes.kitchen.frame())

async function pick(page: Page, subject: string) {
  await page.locator('.es-kitchen__pick').nth(SUBJECTS.indexOf(subject as (typeof SUBJECTS)[number])).click()
  await settle(page)
}

test.describe('every piece and the assembled pass, within budget (A§11.1)', () => {
  for (const tier of [1, 2] as const) {
    test(`at T${tier}`, async ({ page }) => {
      test.setTimeout(240_000)
      await openKitchen(page, `?es-tier=${tier}`)
      await settle(page)
      const lines: string[] = []
      for (const subject of SUBJECTS) {
        await pick(page, subject)
        const stats = await frame(page)
        expect(stats.sceneCalls, subject).toBeLessThanOrEqual(BUDGET[tier])
        expect(stats.calls, subject).toBeLessThanOrEqual(100)
        lines.push(`${subject} ${stats.sceneCalls}/${stats.calls} calls, ${stats.triangles} triangles, ${stats.instances} instances, ${stats.shadows ?? 0} shadow maps`)
      }
      console.log(`T${tier}: ${lines.join('; ')}`)
    })
  }
})

test.describe('what each tier draws (scene kit v1)', () => {
  test('T1 keeps the props and their contact shadows, and draws no shadow map, bloom, cone or steam', async ({ page }) => {
    await openKitchen(page, '?es-tier=1')
    await settle(page)
    const stats = await frame(page)
    expect(stats.passes).toEqual(['scene'])
    expect(stats.shadows ?? 0).toBe(0)
    // Instanced: the contact shadows, the tickets, the clips and the plates; no steam's 32 and no cones.
    expect(stats.instances).toBeLessThan(80)
  })

  test("T2 adds the heat lamps' shadow maps, bloom, the light cones and the steam", async ({ page }) => {
    await openKitchen(page, '?es-tier=1')
    await settle(page)
    const t1 = await frame(page)
    await openKitchen(page, '?es-tier=2')
    await settle(page)
    const t2 = await frame(page)
    expect(t2.passes).toEqual(['scene', 'bloom', 'final'])
    expect(t2.shadows).toBe(3)
    // The steam's 32 puffs and the three lamps' cones are instanced draws T1 does not have.
    expect(t2.instances - t1.instances).toBeGreaterThanOrEqual(35)
  })
})

test.describe('reduced motion (A§6.9, A§11.2)', () => {
  test.use({ reducedMotion: 'reduce' })

  test('a bell changes the kitchen in place, and no animation frame is requested once it settles', async ({ page, context }) => {
    // Counts the frames asked for, and keeps the ones asked for and not yet run: on a software GPU a frame can wait a few hundred
    // milliseconds for its turn, longer than settle()'s half second, and it is still the last frame of the bell, not a new one.
    await context.addInitScript(() => {
      window.__raf = 0
      window.__rafWaiting = new Set<number>()
      const request = window.requestAnimationFrame.bind(window)
      const cancel = window.cancelAnimationFrame.bind(window)
      window.requestAnimationFrame = (callback: FrameRequestCallback) => {
        window.__raf = (window.__raf ?? 0) + 1
        const id = request((time) => {
          window.__rafWaiting?.delete(id)
          callback(time)
        })
        window.__rafWaiting?.add(id)
        return id
      }
      window.cancelAnimationFrame = (id: number) => {
        window.__rafWaiting?.delete(id)
        cancel(id)
      }
    })
    await openKitchen(page, '?es-tier=2')
    await settle(page)
    await page.getByRole('button', { name: /Ring the bell: one fire on the kitchen/ }).click()
    await settle(page)
    await expect.poll(() => page.evaluate(() => window.__rafWaiting?.size ?? 0), { timeout: 10_000 }).toBe(0)
    const after = await page.evaluate(() => window.__raf ?? 0)
    await page.waitForTimeout(2000)
    expect(await page.evaluate(() => window.__raf ?? 0)).toBe(after)
    expect((await probe(page))?.p95 ?? null).toBeNull()
  })
})

test.describe('one live canvas on the page (A§6.4)', () => {
  test('scrolling to the kitchen opens it, and the kit specimen above shows its 2D twin', async ({ page }) => {
    await page.goto(`${ORIGIN}/design?es-tier=1`)
    await page.locator('#scene-kit').scrollIntoViewIfNeeded()
    await expect(page.locator('[data-stage="specimen"]')).toHaveAttribute('data-stage-phase', 'live', { timeout: 30_000 })
    await kitchen(page).scrollIntoViewIfNeeded()
    await settle(page)
    await expect(page.locator('[data-stage="specimen"]')).toHaveAttribute('data-stage-phase', 'waiting')
    await expect(page.locator('[data-stage="specimen"] svg.es-twin')).toBeVisible()
  })
})

test.describe('the 2D note (A§6.7)', () => {
  test('with WebGL off, the Stage shows the drawing of the piece and fetches nothing of three', async ({ page, context, requests }) => {
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
        return (original as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest)
      } as typeof original
    })
    await openKitchen(page)
    await expect(kitchen(page)).toHaveAttribute('data-tier', '0')
    await expect(kitchen(page).locator('svg.es-draw')).toBeVisible()
    await page.locator('.es-kitchen__pick').nth(SUBJECTS.indexOf('pans')).click()
    await expect(kitchen(page).locator('svg.es-draw')).toHaveAttribute('aria-label', /Hotel pans/)
    // scene-kit-data (the props' pure sizes, which the notes read) is not 3D; three, the props and the scene are.
    expect(requests.filter((request) => /\/assets\/(?:three-vendor|scene-kit|KitchenScene3D)-[\w-]{8}\.js$/.test(request))).toEqual([])
  })
})
