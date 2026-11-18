/*
 * The step loop's 3D scene, the time track (R-T18; REDESIGN §2.8, §2.9), in Playwright's Chromium, through `/play/loop`:
 *
 *   - a whole night of first-4-par draws in at most 100 calls, at T1 and at T2, read from the scene's own `renderer.info` (A§11.1);
 *   - `V` swaps 2D and 3D and keeps the levers; `C` and the buttons reach all six cameras;
 *   - the waiting queue is drawn once, in the dock, and a chip admitted there shows on the plate;
 *   - the capture is not blank at T1 and at T2, where the contact shadows and baked occlusion are all the depth there is;
 *   - all text is DOM over the canvas;
 *   - Compare stacks three schedulers, and Scale draws more than 10,000 instances in the kit's budget of 10 calls;
 *   - nothing blooms: at T2 the frame is the scene and the final pass;
 *   - under reduced motion a step and Compare's move are drawn in place, and then no animation frame is asked for.
 *
 * How it runs, as e2e/scene-kit.spec.ts does: one test build with `VITE_ES_TEST_HOOKS=1` (it exposes `window.__esScene` and honours
 * `?es-tier=<0-3>`), served by `context.route` so no server runs, with any request off the origin failing the test. Chromium renders
 * WebGL2 with SwiftShader, so CI needs no GPU.
 *
 *   npx playwright test e2e/loop-scene.spec.ts
 *
 * `ES_CHROMIUM=<path to chrome>` runs it with another Chromium build than the one Playwright installed.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { build } from 'vite'
import type { FrameStats } from '../src/scene/stage-runtime'
import { bannedOn } from './support/copy-scan'
import { pixelStats } from './support/pixels'
import type { SceneHook } from '../src/scene/test-hook'

declare global {
  interface Window {
    __raf?: number
  }
}

const root = path.resolve(import.meta.dirname, '..')
const ORIGIN = 'http://localhost:4176'
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
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
  viewport: { width: 1440, height: 900 },
})

base.beforeAll(async () => {
  dist = mkdtempSync(path.join(tmpdir(), 'es-loop-scene-'))
  process.env.VITE_ES_TEST_HOOKS = '1'
  await build({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'error', build: { outDir: dist, emptyOutDir: true } })
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
      await use(requests)
      expect(strays, 'requests that left the origin').toEqual([])
      expect(errors, 'errors on the page').toEqual([])
    },
    { auto: true },
  ],
})

const stage = (page: Page) => page.locator('[data-stage="loop"]')
const game = (page: Page) => page.locator('section[data-game="loop"]')
const probe = (page: Page) => page.evaluate(() => window.__esScene?.probes.loop?.info() ?? null)
const bell = (page: Page) => page.locator('[data-loop-step] button')
const bellCount = (page: Page) => page.locator('[data-loop-readout] [data-readout-id="step"] dd').evaluate((dd) => dd.firstChild?.textContent ?? '')
const overlap = (page: Page) => page.getByRole('switch', { name: /Async scheduling/ })
const camera = (page: Page) => page.getByRole('group', { name: 'Camera' })
const labels = (page: Page) => stage(page).locator('.es-labels')
const CAMERAS = ['Lifted', 'Side', 'Along time', 'Top', 'Compare', 'Scale']

/**
 * Opens a level on a device of the tier given. The diagram is the default view since R-T17 (REDESIGN §2.9), so where the tier draws 3D the
 * view switch turns the scene on, as a learner does.
 */
async function open(page: Page, level: string, tier: number) {
  await page.goto(`${ORIGIN}/play/loop?level=${level}&es-tier=${tier}`)
  await page.evaluate(() => document.fonts.ready)
  await expect(game(page)).toBeVisible()
  if (tier >= 1) {
    await page.getByRole('button', { name: '3D', exact: true }).click()
    await expect(game(page)).toHaveAttribute('data-view', '3d')
  }
}

/** Waits until the scene is drawn, the Stage says it is settled, and no frame has been drawn for half a second. */
async function settle(page: Page) {
  await expect(stage(page)).toHaveAttribute('data-stage-phase', 'live', { timeout: 30_000 })
  await expect(stage(page)).toHaveAttribute('data-settled', 'true', { timeout: 30_000 })
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

async function frame(page: Page): Promise<FrameStats> {
  return page.evaluate(() => (window.__esScene as SceneHook).probes.loop.frame())
}

/** Admits every waiting request a free slot takes, from the chips in the dock, as a visitor's taps do. */
async function admitAll(page: Page) {
  const chips = page.locator('[data-loop-controls] ul button:not([disabled])')
  while ((await chips.count()) > 0) {
    const before = await chips.count()
    await chips.first().click()
    await expect(chips).not.toHaveCount(before)
  }
}

async function choose(page: Page, name: string) {
  await camera(page).getByRole('button', { name, exact: true }).click()
  await expect(camera(page).getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(stage(page).locator(`[data-track-camera="${CAMERAS_ID[name]}"]`)).toHaveCount(1)
}

const CAMERAS_ID: Record<string, string> = { Lifted: 'lifted', Side: 'side', 'Along time': 'along', Top: 'top', Compare: 'compare', Scale: 'scale' }

test.describe('the draw-call budget at the practice seed (A§11.1)', () => {
  for (const tier of [1, 2]) {
    test(`a whole night of first-4-par draws in at most 100 calls, at T${tier}`, async ({ page }) => {
      test.setTimeout(300_000)
      await open(page, 'first-4-par', tier)
      await settle(page)
      await game(page).focus()
      await page.keyboard.press('KeyO')
      let most: FrameStats | null = null
      for (let turn = 0; turn < 80 && (await page.locator('[data-result] [data-loop-debrief]').count()) === 0; turn++) {
        await admitAll(page)
        if (await bell(page).isEnabled()) await bell(page).click()
        await settle(page)
        const stats = await frame(page)
        if (most === null || stats.sceneCalls > most.sceneCalls) most = stats
      }
      expect(await page.locator('[data-result] [data-loop-debrief]').count()).toBe(1)
      if (most === null) throw new Error('no frame was drawn')
      expect(most.sceneCalls).toBeLessThanOrEqual(100)
      expect(most.calls).toBeLessThanOrEqual(100)
      expect(most.instances).toBeLessThanOrEqual(tier === 1 ? 2500 : 6000)
      // Nothing blooms and no pass follows the scene: the frame is the scene at every tier (R-T44 took the composer out with the kitchen).
      expect(most.passes).toEqual(['scene'])
      console.log(`T${tier}: at most ${most.sceneCalls} scene draw calls (${most.calls} in the frame, passes ${most.passes.join(' + ')}), ${most.instances} instances, ${most.triangles} triangles`)
    })
  }
})

test.describe('the views and the cameras (A§6.8)', () => {
  test('`V` swaps 2D and 3D and keeps the levers and the run', async ({ page }) => {
    await open(page, 'first-3-gap', 2)
    await settle(page)
    await game(page).focus()
    await page.keyboard.press('KeyO')
    await page.keyboard.press('Period')
    await settle(page)
    const before = { count: await bellCount(page), overlap: await overlap(page).getAttribute('aria-checked') }
    expect(before).toEqual({ count: '3', overlap: 'true' })

    await game(page).focus()
    await page.keyboard.press('KeyV')
    await expect(game(page)).toHaveAttribute('data-view', '2d')
    await expect(page.locator('[data-surface="2d"] [data-loop-view] svg.es-lanes__svg')).toBeVisible()
    await expect(stage(page)).toHaveCount(0)
    expect({ count: await bellCount(page), overlap: await overlap(page).getAttribute('aria-checked') }).toEqual(before)

    await game(page).focus()
    await page.keyboard.press('KeyV')
    await expect(game(page)).toHaveAttribute('data-view', '3d')
    await settle(page)
    expect({ count: await bellCount(page), overlap: await overlap(page).getAttribute('aria-checked') }).toEqual(before)
    await expect(labels(page).getByText('now', { exact: true })).toHaveCount(1)
  })

  test('`C` cycles all six cameras from Lifted, and each button reaches its own', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page, 'first-2-slot', 2)
    await settle(page)
    const pressed = () => camera(page).locator('button[aria-pressed="true"]').textContent()
    expect(await pressed()).toBe(CAMERAS[0])
    for (const name of [...CAMERAS.slice(1), CAMERAS[0]]) {
      await game(page).focus()
      await page.keyboard.press('KeyC')
      await expect.poll(pressed).toBe(name)
      await expect(page.locator('[data-live="line"]')).toContainText(`Camera: ${name}.`)
      await settle(page)
    }
    for (const name of CAMERAS) {
      await choose(page, name)
      await settle(page)
    }
  })
})

test.describe('the queue is drawn once (A§6.8): in 3D the dock holds it, and the scene shows what a tap on it did', () => {
  test('the plate draws no chip, and admitting R1 from the dock fills slot 1 on the plate', async ({ page }) => {
    await open(page, 'first-1-fill', 2)
    await settle(page)
    await expect(labels(page).locator('.es-track-label--chip')).toHaveCount(0)
    await page.locator('[data-loop-controls] ul button:not([disabled])', { hasText: /^R1$/ }).click()
    await expect(page.locator('[data-live="line"]')).toContainText('Request R1 admitted into slot 1.')
    await settle(page)
    await expect(labels(page).locator('.es-track-label--row', { hasText: 'slot 1 · R1' })).toHaveCount(1)
  })
})

test.describe('the picture', () => {
  for (const tier of [1, 2]) {
    test(`the capture is not blank at T${tier}, with its contact shadows and baked occlusion, and it is kept as an artifact`, async ({ page }, info) => {
      await open(page, 'first-3-gap', tier)
      await settle(page)
      await game(page).focus()
      await page.keyboard.press('KeyO')
      await page.keyboard.press('Period')
      await settle(page)
      const canvas = stage(page).locator('canvas')
      await page.addStyleTag({ content: '.es-labels { visibility: hidden !important; }' })
      const sampled = await pixelStats(page.context(), await canvas.screenshot())
      expect(sampled.colours).toBeGreaterThan(40)
      expect(sampled.spread).toBeGreaterThan(12)
      await page.addStyleTag({ content: '.es-labels { visibility: visible !important; }' })
      const shot = info.outputPath(`loop-track-t${tier}.png`)
      await stage(page).screenshot({ path: shot })
      await info.attach(`loop-track-t${tier}`, { path: shot, contentType: 'image/png' })
      console.log(`T${tier} capture ${sampled.width}x${sampled.height}: ${sampled.colours} distinct colours in ${sampled.samples} samples, luma spread ${sampled.spread.toFixed(1)}`)
    })
  }

  test('all text is DOM: the rows, the requests, now and the clock are page text over the canvas', async ({ page }) => {
    await open(page, 'first-2-slot', 2)
    await settle(page)
    await expect(labels(page).locator('.es-track-label--row', { hasText: 'CPU · engine core thread' })).toHaveCount(1)
    for (const slot of [1, 2, 3, 4]) await expect(labels(page).locator('.es-track-label--row', { hasText: new RegExp(`^slot ${slot} · R${slot}$`) })).toHaveCount(1)
    await expect(labels(page).locator('.es-track-label--axis', { hasText: 'synthetic ticks' })).toHaveCount(1)
    await expect(labels(page).locator('.es-track-label--now')).toHaveText('now')
    // The colour code is a form as well as a colour, as in the 2D view: each row's name carries its glyph, and the legend stands over the plate.
    await expect(labels(page).locator('.es-track-label--row', { hasText: 'CPU · engine core thread' }).locator('svg[data-glyph="circle"]')).toHaveCount(1)
    await expect(labels(page).locator('.es-track-label--row', { hasText: /^slot 1 · R1$/ }).locator('svg[data-glyph="hexagon"]')).toHaveCount(1)
    await expect(stage(page).locator('.es-track3d__legend ul.es-legend[aria-label="Legend: step loop"]')).toBeVisible()
    // The reference run stands behind the learner's, each named.
    for (const name of ['Reference run', 'Your run']) await expect(labels(page).locator('.es-track-label--band', { hasText: name })).toHaveCount(1)
    await expect(stage(page).locator('.es-stage__scene')).toHaveAttribute('aria-hidden', 'true')
    expect(await stage(page).locator('canvas').evaluate((canvas) => canvas.textContent)).toBe('')
  })
})

test.describe('Compare and Scale: the model\'s own runs', () => {
  test('Compare stacks static batching, continuous batching and async scheduling, and says what it shows', async ({ page }) => {
    await open(page, 'first-3-gap', 2)
    await settle(page)
    await choose(page, 'Compare')
    await settle(page)
    for (const name of ['Static batching', 'Continuous batching', 'Async scheduling']) await expect(labels(page).locator('.es-track-label--band', { hasText: name })).toHaveCount(1)
    await expect(labels(page).locator('.es-track-label--caption')).toContainText('synthetic ticks')
    await expect(labels(page).locator('.es-track-label--now')).toHaveCount(3)
  })

  for (const tier of [1, 2]) {
    test(`Scale draws 64 slots, more than 10,000 instances in at most 10 calls, at T${tier}`, async ({ page }) => {
      test.setTimeout(120_000)
      await open(page, 'first-3-gap', tier)
      await settle(page)
      await choose(page, 'Scale')
      await settle(page)
      const stats = await frame(page)
      expect(stats.instances).toBeGreaterThanOrEqual(10_000)
      expect(stats.sceneCalls).toBeLessThanOrEqual(10)
      await expect(labels(page).locator('.es-track-label--caption')).toContainText('64 slots')
      console.log(`Scale T${tier}: ${stats.instances} instances, ${stats.sceneCalls} scene draw calls, ${stats.calls} in the frame`)
    })
  }
})

test.describe('reduced motion (A§6.9): changes cut, and nothing moves without input', () => {
  test.use({ reducedMotion: 'reduce' })

  test('a step and Compare\'s move are drawn in place, and then no animation frame is asked for', async ({ page, context }) => {
    await context.addInitScript(() => {
      window.__raf = 0
      const request = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = (callback: FrameRequestCallback) => {
        window.__raf = (window.__raf ?? 0) + 1
        return request(callback)
      }
    })
    await open(page, 'first-3-gap', 1)
    await settle(page)
    await game(page).focus()
    await page.keyboard.press('KeyO')
    await bell(page).click()
    await settle(page)
    let after = await page.evaluate(() => window.__raf ?? 0)
    await page.waitForTimeout(2000)
    expect(await page.evaluate(() => window.__raf ?? 0)).toBe(after)

    await choose(page, 'Compare')
    await settle(page)
    after = await page.evaluate(() => window.__raf ?? 0)
    await page.waitForTimeout(2000)
    expect(await page.evaluate(() => window.__raf ?? 0)).toBe(after)
    expect((await probe(page))?.p95, 'the governor never sampled an animation').toBeNull()
  })
})

// The copy guard over the 3D view (REDESIGN 2.7): the route sweep reads every page with 3D off, so the words that only 3D shows are read here, at a desk.
test.describe('the words of the 3D view (R-T14)', () => {
  test('no banned word or phrase on the step loop with 3D on, before a move', async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, 'async', 1)
    await page.waitForTimeout(500)
    expect(await bannedOn(page), 'banned words on the page in 3D').toEqual([])
  })
})
