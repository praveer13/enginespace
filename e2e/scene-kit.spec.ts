/*
 * W0-T15's acceptance checks for the scene kit, in Playwright's Chromium, through the specimen on /design:
 *
 *   1. With WebGL forced off, Stage renders its 2D child and announces the switch.
 *   2. A forced `webglcontextlost` swaps to 2D and keeps the session state.
 *   3. Under `reducedMotion: 'reduce'`, no animation frame is requested after the first settled frame.
 *   4. 10k instances draw in at most 10 draw calls.
 *   5. The `postfx` chunk is absent from the network log at T1 and present at T2 (forced tiers).
 *   (6. `verify:boundaries` passes: a bun gate, `bun scripts/verify.ts boundaries`.)
 *
 * And the selection: a pick in the 3D scene selects the fire and moves focus to its option in the list.
 *
 * How it runs. The spec builds the app once with `VITE_ES_TEST_HOOKS=1`, a test build: it exposes each live scene's
 * `renderer.info` on `window.__esScene` and honours `?es-tier=<0-3>` (src/scene/test-hook.ts, tiers.ts). Every request is
 * answered from that build by `context.route`, so no server runs, and a request to any other origin fails the test
 * (ARCHITECTURE §1, I1). Chromium renders WebGL2 with SwiftShader, so CI needs no GPU.
 *
 *   npx playwright test e2e/scene-kit.spec.ts
 *
 * `ES_CHROMIUM=<path to chrome>` runs it with another Chromium build than the one Playwright installed.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { build } from 'vite'
import { initialFired, specimenLayout, specimenRun } from '../src/scene/specimen-layout'
import type { FrameStats } from '../src/scene/stage-runtime'
import type { SceneHook } from '../src/scene/test-hook'

declare global {
  interface Window {
    __raf?: number
  }
}

const root = path.resolve(import.meta.dirname, '..')
const ORIGIN = 'http://localhost:4175'
const UNAVAILABLE = '3D view unavailable; showing the 2D view.'
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

base.use({
  launchOptions: {
    executablePath: process.env.ES_CHROMIUM || undefined,
    // SwiftShader everywhere, GPU or none, so every run renders alike.
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
  viewport: { width: 1280, height: 900 },
})

base.beforeAll(async () => {
  dist = mkdtempSync(path.join(tmpdir(), 'es-scene-kit-'))
  process.env.VITE_ES_TEST_HOOKS = '1'
  await build({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'error', build: { outDir: dist, emptyOutDir: true } })
})

base.afterAll(() => {
  if (dist) rmSync(dist, { recursive: true, force: true })
})

/** Each test serves the build itself, records what the page asked for, and fails on any error the page throws or logs. */
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
    // Every test needs the site served, whether or not it reads the log.
    { auto: true },
  ],
})

const stage = (page: Page) => page.locator('[data-stage="specimen"]')
const kit = (page: Page) => page.locator('.es-kit')
const probe = (page: Page) => page.evaluate(() => window.__esScene?.probes.specimen?.info() ?? null)
const chunk = (requests: string[], name: string) => requests.some((request) => new RegExp(`/assets/${name}-[\\w-]+\\.js$`).test(request))

async function openDesign(page: Page, query = '') {
  await page.goto(`${ORIGIN}/design${query}`)
  await page.evaluate(() => document.fonts.ready)
  await page.locator('#scene-kit').scrollIntoViewIfNeeded()
}

/** Waits until the scene is drawn, the Stage says it is settled, and no frame has been drawn for half a second. */
async function settle(page: Page) {
  await expect(stage(page)).toHaveAttribute('data-stage-phase', 'live', { timeout: 20_000 })
  await expect(stage(page)).toHaveAttribute('data-settled', 'true', { timeout: 20_000 })
  let frames = -1
  await expect
    .poll(
      async () => {
        const now = (await probe(page))?.frames ?? -2
        const still = now === frames
        frames = now
        return still
      },
      { intervals: [500], timeout: 20_000 },
    )
    .toBe(true)
}

async function frame(page: Page): Promise<FrameStats> {
  return page.evaluate(() => (window.__esScene as SceneHook).probes.specimen.frame())
}

test.describe('the Stage when 3D cannot run (A§6.7)', () => {
  test('with WebGL forced off, it renders its 2D child and announces the switch', async ({ page, context, requests }) => {
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
        return (original as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest)
      } as typeof original
    })
    await openDesign(page)
    await expect(stage(page)).toHaveAttribute('data-stage-phase', 'twin')
    await expect(stage(page)).toHaveAttribute('data-tier', '0')
    await expect(stage(page).locator('.es-stage__twin svg.es-twin')).toBeVisible()
    await expect(stage(page).locator('canvas')).toHaveCount(0)
    await expect(stage(page).locator('[data-live="stage"]')).toHaveText(UNAVAILABLE)
    await expect(stage(page).locator('[data-note="unavailable"]')).toContainText('This browser has no WebGL2')
    expect(chunk(requests, 'three-vendor'), 'the 3D chunks are never requested').toBe(false)
    expect(chunk(requests, 'SpecimenScene3D')).toBe(false)
  })

  test('when the scene cannot make its context, it falls back to the 2D view and says so', async ({ page, context }) => {
    // The probe finds WebGL2, the scene's own canvas does not get it: a failed context creation.
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (this.className === 'es-scene__canvas' && type === 'webgl2') return null
        return (original as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest)
      } as typeof original
    })
    await openDesign(page, '?es-tier=2')
    await expect(stage(page)).toHaveAttribute('data-stage-phase', 'fallback', { timeout: 20_000 })
    await expect(stage(page)).toHaveAttribute('data-failure', 'create')
    await expect(stage(page).locator('.es-stage__twin svg.es-twin')).toBeVisible()
    await expect(stage(page).locator('[data-live="stage"]')).toHaveText(UNAVAILABLE)
  })
})

test.describe('a lost context (A§6.7)', () => {
  test('swaps to 2D and keeps the session state, restores once, and stays 2D after a second loss', async ({ page }) => {
    await openDesign(page, '?es-tier=1')
    await settle(page)

    // A session to keep: overlap on, two more fires, a fire selected.
    await kit(page).getByRole('switch', { name: /Write the next call during this fire/ }).click()
    const bell = kit(page).getByRole('button', { name: /Ring the bell/ })
    await bell.click()
    await bell.click()
    await kit(page).getByRole('option').nth(2).click()
    const before = {
      fire: await kit(page).locator('.es-printer').first().textContent(),
      selected: await kit(page).getByRole('option', { selected: true }).textContent(),
      overlap: await kit(page).getByRole('switch', { name: /Write the next call/ }).getAttribute('aria-checked'),
    }
    await settle(page)

    expect(await page.evaluate(() => (window.__esScene as SceneHook).probes.specimen.loseContext())).toBe(true)
    await expect(stage(page)).toHaveAttribute('data-stage-phase', 'fallback')
    await expect(stage(page)).toHaveAttribute('data-failure', 'lost')
    await expect(stage(page).locator('.es-stage__twin svg.es-twin')).toBeVisible()
    await expect(stage(page).locator('canvas')).toHaveCount(0)
    await expect(stage(page).locator('[data-live="stage"]')).toHaveText(UNAVAILABLE)
    // The session lives outside the views: the swap lost none of it.
    expect({
      fire: await kit(page).locator('.es-printer').first().textContent(),
      selected: await kit(page).getByRole('option', { selected: true }).textContent(),
      overlap: await kit(page).getByRole('switch', { name: /Write the next call/ }).getAttribute('aria-checked'),
    }).toEqual(before)
    // The 2D view in the box draws the same selection.
    await expect(stage(page).locator('.es-twin__selected')).toHaveCount(1)

    // It tries once more.
    await expect(stage(page)).toHaveAttribute('data-stage-phase', 'live', { timeout: 10_000 })
    await expect(stage(page).locator('[data-live="stage"]')).toHaveText('3D view restored.')
    await settle(page)

    // A second loss: the session stays 2D.
    await page.evaluate(() => (window.__esScene as SceneHook).probes.specimen.loseContext())
    await expect(stage(page)).toHaveAttribute('data-stage-phase', 'fallback')
    await page.waitForTimeout(3000)
    await expect(stage(page)).toHaveAttribute('data-stage-phase', 'fallback')
    await expect(stage(page).locator('[data-note="unavailable"]')).toContainText('stopped twice')
  })
})

test.describe('reduced motion (A§6.9, A§11.2)', () => {
  test.use({ reducedMotion: 'reduce' })

  test('no animation frame is requested after the first settled frame', async ({ page, context }) => {
    await context.addInitScript(() => {
      window.__raf = 0
      const request = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = (callback: FrameRequestCallback) => {
        window.__raf = (window.__raf ?? 0) + 1
        return request(callback)
      }
    })
    // The device's own tier, so the governor is live: its p95 staying empty proves nothing animated.
    await openDesign(page)
    await settle(page)
    const settled = await page.evaluate(() => window.__raf ?? 0)
    await page.waitForTimeout(2500)
    expect(await page.evaluate(() => window.__raf ?? 0)).toBe(settled)

    // A bell under reduced motion draws the change in place: a few frames, no animation, then nothing.
    await kit(page).getByRole('button', { name: /Ring the bell/ }).click()
    await settle(page)
    const after = await page.evaluate(() => window.__raf ?? 0)
    await page.waitForTimeout(2000)
    expect(await page.evaluate(() => window.__raf ?? 0)).toBe(after)
    expect((await probe(page))?.p95, 'the governor never sampled an animation').toBeNull()
  })
})

test.describe('the draw-call budget (A§11.1)', () => {
  for (const tier of [1, 2]) {
    test(`10k instances draw in at most 10 draw calls, at T${tier}`, async ({ page }) => {
      await openDesign(page, `?es-tier=${tier}`)
      await settle(page)
      await kit(page).getByRole('button', { name: /64 clips/ }).click()
      await settle(page)
      const stats = await frame(page)
      expect(stats.instances).toBeGreaterThanOrEqual(10_000)
      expect(stats.sceneCalls).toBeLessThanOrEqual(10)
      if (tier === 1) expect(stats.calls).toBeLessThanOrEqual(10)
      console.log(`T${tier}: ${stats.instances} instances, ${stats.sceneCalls} scene draw calls, ${stats.calls} in the frame, ${stats.triangles} triangles`)
    })
  }
})

test.describe('post-processing loads only at T2 and up (A§6.5, A§6.10)', () => {
  test('the postfx chunk is absent at T1', async ({ page, requests }) => {
    await openDesign(page, '?es-tier=1')
    await settle(page)
    // Exercise the scene: a bell, every camera preset, the long night.
    await kit(page).getByRole('button', { name: /Ring the bell/ }).click()
    for (const name of ['Side of the pass', 'Under the lamps', 'Over the shoulder']) {
      await kit(page).getByRole('button', { name }).click()
      await settle(page)
    }
    expect(chunk(requests, 'SpecimenScene3D')).toBe(true)
    expect(chunk(requests, 'postfx')).toBe(false)
    expect((await probe(page))?.passes).toEqual(['scene'])
  })

  test('the postfx chunk is present at T2, and the frame runs bloom and the final pass', async ({ page, requests }) => {
    await openDesign(page, '?es-tier=2')
    await settle(page)
    expect(chunk(requests, 'postfx')).toBe(true)
    expect((await frame(page)).passes).toEqual(['scene', 'bloom', 'final'])
  })
})

test.describe('selection (A§6.4, A§6.8)', () => {
  test('a pick in the scene selects the fire and moves focus to its option in the list', async ({ page }) => {
    await openDesign(page, '?es-tier=1')
    await settle(page)
    // Where the newest fire's slab lies, from the same layout the scene draws.
    const settings = { clips: 4, overlap: false } as const
    const run = specimenRun(settings)
    const layout = specimenLayout(run, settings, initialFired(4, run))
    const newest = layout.fires.at(-1)
    if (!newest) throw new Error('the specimen has no fire')
    const z = ((newest.start + newest.end) / 2) * layout.unitsPerTime
    // Between two places, on the slab itself.
    const x = layout.lanes.gpuX - layout.lanes.gpuWidth / 2 + layout.lanes.slotPitch
    const at = await page.evaluate(([px, pz]) => (window.__esScene as SceneHook).probes.specimen.project([px, 0.06, pz], 'track'), [x, z] as const)
    if (!at) throw new Error('the newest fire is behind the camera')
    const box = await stage(page).locator('canvas').boundingBox()
    if (!box) throw new Error('no canvas')
    await page.mouse.click(box.x + at.x, box.y + at.y)
    const options = kit(page).getByRole('option')
    const last = options.nth((await options.count()) - 1)
    await expect(last).toHaveAttribute('aria-selected', 'true')
    await expect(last).toBeFocused()
  })
})
