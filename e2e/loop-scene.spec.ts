/*
 * W0-T17's acceptance checks for Service's 3D scene, in Playwright's Chromium, through `/play/loop`:
 *
 *   2. At most 100 draw calls at the practice seed, read from the scene's own `renderer.info` (A§11.1), at T1 and at T2.
 *   3. `V` swaps 2D and 3D and keeps the levers; `C` and the buttons reach every camera preset.
 *   4. The screenshot artifact is non-blank: the canvas's pixels are sampled, and the capture is kept as a test artifact.
 *   5. All text is DOM: the tickets' numbers and the tapes' words are page text over the canvas.
 *   And W0's finding F5: on a phone the tapes naming the line and the expo never meet.
 *   And the motion grammar under reduced motion: after a bell the scene settles and asks for no frame.
 *   (1. `scene-loop` at most 40 KB gz is a build check: the task's result records the measured size, and W0-T20's verify:bundle gates it.
 *    5's "no material uses a literal colour" is tests/play/loop-scene.test.ts and tests/design/literals.test.ts.)
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
import { initState } from '../packages/play/loop/engine'
import { buildLevel } from '../packages/play/loop/levels'
import { loopView } from '../packages/play/loop/session'
import { serviceKitchen, serviceScene } from '../src/games/loop/scene-layout'
import type { FrameStats } from '../src/scene/stage-runtime'
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
const bell = (page: Page) => page.getByRole('button', { name: /Ring the bell/ })
const bellCount = (page: Page) => page.locator('[data-loop-controls] .es-bell__count .es-readout__value').textContent()
const overlap = (page: Page) => page.getByRole('switch', { name: /Write the next call during this fire/ })
const camera = (page: Page) => page.getByRole('group', { name: 'Camera on the pass' })

async function open(page: Page, level: string, tier: number) {
  await page.goto(`${ORIGIN}/play/loop?level=${level}&es-tier=${tier}`)
  await page.evaluate(() => document.fonts.ready)
  await expect(game(page)).toBeVisible()
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

/** Hangs every free clip from the DOM tickets, as a visitor's taps do. */
async function hangAll(page: Page) {
  const tickets = page.locator('[data-loop-controls] ul button:not([disabled])')
  while ((await tickets.count()) > 0) {
    const before = await tickets.count()
    await tickets.first().click()
    await expect(tickets).not.toHaveCount(before)
  }
}

test.describe('the draw-call budget at the practice seed (A§11.1)', () => {
  for (const tier of [1, 2]) {
    test(`a whole night of first-4-par draws in at most 100 calls, at T${tier}`, async ({ page }) => {
      test.setTimeout(300_000)
      await open(page, 'first-4-par', tier)
      await settle(page)
      await game(page).focus()
      await page.keyboard.press('KeyO')
      let most: FrameStats | null = null
      // The house's way: every free clip hung, then the bell, until every ticket is served.
      for (let turn = 0; turn < 80 && (await page.getByRole('button', { name: 'See the debrief' }).count()) === 0; turn++) {
        await hangAll(page)
        if (await bell(page).isEnabled()) await bell(page).click()
        await settle(page)
        const stats = await frame(page)
        if (most === null || stats.sceneCalls > most.sceneCalls) most = stats
      }
      expect(await page.getByRole('button', { name: 'See the debrief' }).count()).toBe(1)
      if (most === null) throw new Error('no frame was drawn')
      expect(most.sceneCalls).toBeLessThanOrEqual(100)
      expect(most.calls).toBeLessThanOrEqual(100)
      console.log(`T${tier}: at most ${most.sceneCalls} scene draw calls (${most.calls} in the frame, passes ${most.passes.join(' + ')}), ${most.instances} instances, ${most.triangles} triangles`)
    })
  }
})

test.describe('the views and the camera (A§6.8)', () => {
  test('`V` swaps 2D and 3D and keeps the levers, and the night', async ({ page }) => {
    await open(page, 'first-3-gap', 2)
    await settle(page)
    await expect(game(page)).toHaveAttribute('data-view', '3d')
    await game(page).focus()
    await page.keyboard.press('KeyO')
    await page.keyboard.press('Period')
    await settle(page)
    const before = { count: await bellCount(page), overlap: await overlap(page).getAttribute('aria-checked') }
    expect(before).toEqual({ count: '0003', overlap: 'true' })

    await game(page).focus()
    await page.keyboard.press('KeyV')
    await expect(game(page)).toHaveAttribute('data-view', '2d')
    await expect(page.locator('[data-surface="2d"] [data-loop-view] svg')).toBeVisible()
    await expect(stage(page)).toHaveCount(0)
    expect({ count: await bellCount(page), overlap: await overlap(page).getAttribute('aria-checked') }).toEqual(before)

    await game(page).focus()
    await page.keyboard.press('KeyV')
    await expect(game(page)).toHaveAttribute('data-view', '3d')
    await settle(page)
    expect({ count: await bellCount(page), overlap: await overlap(page).getAttribute('aria-checked') }).toEqual(before)
    // The scene draws the same night: the fired rail is up, because a fire is on the line.
    await expect(stage(page).locator('.es-label.es-loop-label--fired')).not.toHaveCount(0)
  })

  test('`C` cycles every preset and each button reaches its own', async ({ page }) => {
    await open(page, 'first-2-slot', 2)
    await settle(page)
    const names = ['Over the shoulder', 'Side of the pass', 'Under the lamps']
    const pressed = () => camera(page).locator('button[aria-pressed="true"]').textContent()
    expect(await pressed()).toBe(names[0])
    for (const name of [...names.slice(1), names[0]]) {
      await game(page).focus()
      await page.keyboard.press('KeyC')
      await expect.poll(pressed).toBe(name)
      await expect(page.locator('[data-live="line"]')).toContainText(`Camera: ${name}.`)
      await settle(page)
    }
    for (const name of names) {
      await camera(page).getByRole('button', { name }).click()
      await expect(camera(page).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
      await settle(page)
    }
  })
})

test.describe('picks (A§6.8, GAMES.md §2.3): a pick on the scene is the same action as its DOM control', () => {
  test('tapping the next ticket on the counter by the printer hangs it on the rail', async ({ page }) => {
    await open(page, 'first-1-fill', 2)
    await settle(page)
    // Where the next ticket in line lies on the counter, No. 01, from the same layout the scene draws.
    const view = loopView(initState(buildLevel('first-1-fill', 1)))
    const [next] = serviceScene(view, serviceKitchen(view.slots, { printer: true, overlap: view.overlapAvailable })).picks
    expect(next.req).toBe(0)
    const at = await page.evaluate((point) => (window.__esScene as SceneHook).probes.loop.project(point), [...next.center] as [number, number, number])
    if (!at) throw new Error('the strip is behind the camera')
    const box = await stage(page).locator('canvas').boundingBox()
    if (!box) throw new Error('no canvas')
    await page.mouse.click(box.x + at.x, box.y + at.y)
    await expect(page.getByRole('button', { name: 'Hang ticket No. 01 on the rail' })).toHaveCount(0)
    await expect(page.locator('[data-live="line"]')).toContainText('Ticket 01 hung on clip 1.')
    await settle(page)
    await expect(stage(page).locator('.es-loop-label--ticket', { hasText: '01' })).toHaveCount(1)
  })
})

test.describe('the picture (TRACKER W0-T17, accepts 4 and 5)', () => {
  test('the 3D capture is not blank: its pixels vary, and it is kept as an artifact', async ({ page }, info) => {
    await open(page, 'first-3-gap', 2)
    await settle(page)
    await game(page).focus()
    await page.keyboard.press('KeyO')
    await page.keyboard.press('Period')
    await settle(page)
    // The canvas as the page composites it, the check e2e/screenshots.spec.ts makes of the front page: a grid of samples, their distinct
    // colours and spread (e2e/support/pixels.ts). At this window the canvas is 870 by 557 px, a size at which a polished part's highlight
    // once overflowed the half-float target and bloom drew the whole frame black [measured 2026-11-04] (src/scene/props/materials.ts,
    // RADIANCE_CAP).
    const canvas = stage(page).locator('canvas')
    await page.addStyleTag({ content: '.es-labels { visibility: hidden !important; }' })
    const sampled = await pixelStats(page.context(), await canvas.screenshot())
    expect(sampled.colours).toBeGreaterThan(40)
    expect(sampled.spread).toBeGreaterThan(12)
    await page.addStyleTag({ content: '.es-labels { visibility: visible !important; }' })
    const shot = info.outputPath('loop-3d.png')
    await stage(page).screenshot({ path: shot })
    await info.attach('loop-3d', { path: shot, contentType: 'image/png' })
    console.log(`3D capture ${sampled.width}x${sampled.height}: ${sampled.colours} distinct colours in ${sampled.samples} samples, luma spread ${sampled.spread.toFixed(1)}; kept at ${shot}`)
  })

  test('all text is DOM: the tickets\' numbers, the tape and the clock are page text over the canvas', async ({ page }) => {
    await open(page, 'first-2-slot', 2)
    await settle(page)
    const labels = stage(page).locator('.es-labels')
    // first-2-slot opens with the house's four tickets hung: their numbers are print on paper, as DOM.
    for (const number of ['01', '02', '03', '04']) await expect(labels.locator('.es-loop-label--ticket', { hasText: number })).toHaveCount(1)
    await expect(labels.getByText('the line · gpu')).toHaveCount(1)
    await expect(labels.getByText('the expo · cpu')).toHaveCount(1)
    // The labels ride over the canvas, which carries no text and is hidden from assistive technology with its box.
    await expect(stage(page).locator('.es-stage__scene')).toHaveAttribute('aria-hidden', 'true')
    expect(await stage(page).locator('canvas').evaluate((canvas) => canvas.textContent)).toBe('')
  })
})

/** A coarse grid of the canvas's pixels, read back from the test build's kept frame. */
function sampleCanvas(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-stage="loop"] canvas')
    if (!canvas) return []
    const copy = document.createElement('canvas')
    copy.width = canvas.width
    copy.height = canvas.height
    const context = copy.getContext('2d')
    if (!context) return []
    context.drawImage(canvas, 0, 0)
    const { data, width, height } = context.getImageData(0, 0, copy.width, copy.height)
    const out: number[] = []
    for (let y = 2; y < height; y += Math.max(1, Math.floor(height / 48))) {
      for (let x = 2; x < width; x += Math.max(1, Math.floor(width / 72))) {
        const i = (y * width + x) * 4
        out.push(data[i], data[i + 1], data[i + 2])
      }
    }
    return out
  })
}

test.describe('the night on the GPU is the night in the session (W0-T17)', () => {
  // A phone's canvas: small enough that a software renderer draws faster than T1's cap, so the cap really skips renders.
  test.use({ viewport: { width: 390, height: 844 } })

  test('after bells at the T1 frame cap, the frame equals a freshly mounted scene\'s frame of the same night', async ({ page }) => {
    // At T1 the frame-rate cap skips renders while a bell's sweep runs, which once left re-indexed marks with stale matrices on the
    // GPU: a unit cube at the track's origin. A fresh mount uploads every buffer whole, so the two frames must agree.
    test.setTimeout(180_000)
    await open(page, 'first-3-gap', 1)
    // The scene pauses when it is scrolled away, so it stays in view: the keys ring the bell, where a click would scroll to the button.
    await stage(page).scrollIntoViewIfNeeded()
    await settle(page)
    await page.evaluate(() => document.querySelector<HTMLElement>('section[data-game="loop"]')?.focus({ preventScroll: true }))
    await page.keyboard.press('KeyO')
    for (let ring = 0; ring < 2; ring++) {
      await page.keyboard.press('Period')
      await settle(page)
    }
    // Under the lamps the whole night is in view, the track's origin with it.
    await page.keyboard.press('KeyC')
    await page.keyboard.press('KeyC')
    await expect(camera(page).locator('button[aria-pressed="true"]')).toHaveText('Under the lamps')
    await stage(page).scrollIntoViewIfNeeded()
    await settle(page)
    const played = await sampleCanvas(page)
    await page.keyboard.press('KeyV')
    await expect(game(page)).toHaveAttribute('data-view', '2d')
    await page.keyboard.press('KeyV')
    await stage(page).scrollIntoViewIfNeeded()
    await settle(page)
    const fresh = await sampleCanvas(page)
    expect(fresh.length).toBeGreaterThan(1000)
    expect(played.length).toBe(fresh.length)
    let off = 0
    for (let i = 0; i < fresh.length; i += 3) {
      const d = Math.abs(played[i] - fresh[i]) + Math.abs(played[i + 1] - fresh[i + 1]) + Math.abs(played[i + 2] - fresh[i + 2])
      if (d > 24) off += 1
    }
    console.log(`played against fresh: ${off} of ${fresh.length / 3} samples differ`)
    expect(off).toBeLessThanOrEqual(Math.ceil(fresh.length / 3 / 200))
  })
})

test.describe('the tapes naming the line and the expo never meet on a phone (W0 finding F5)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  for (const route of ['/play/loop?level=first-3-gap&es-tier=1', '/?es-tier=1']) {
    test(route, async ({ page }) => {
      test.setTimeout(120_000)
      await page.goto(`${ORIGIN}${route}`)
      await page.evaluate(() => document.fonts.ready)
      const id = route.startsWith('/play') ? 'loop' : 'front'
      const box = page.locator(`[data-stage="${id}"]`)
      await box.scrollIntoViewIfNeeded()
      await expect(box).toHaveAttribute('data-stage-phase', 'live', { timeout: 60_000 })
      await expect(box).toHaveAttribute('data-settled', 'true', { timeout: 60_000 })
      const line = await box.locator('.es-loop-label--tape', { hasText: 'the line · gpu' }).boundingBox()
      const expo = await box.locator('.es-loop-label--tape', { hasText: 'the expo · cpu' }).boundingBox()
      if (line === null || expo === null) throw new Error('a tape is not drawn')
      const apart = line.y + line.height <= expo.y || expo.y + expo.height <= line.y || line.x + line.width <= expo.x || expo.x + expo.width <= line.x
      console.log(`${route} at 390 px: the line's tape at ${JSON.stringify(line)}, the expo's at ${JSON.stringify(expo)}`)
      expect(apart).toBe(true)
    })
  }
})

test.describe('reduced motion (A§6.9): changes cut, and nothing moves without input', () => {
  test.use({ reducedMotion: 'reduce' })

  test('a bell redraws the night in place, and then no animation frame is asked for', async ({ page, context }) => {
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
    const after = await page.evaluate(() => window.__raf ?? 0)
    await page.waitForTimeout(2000)
    expect(await page.evaluate(() => window.__raf ?? 0)).toBe(after)
    expect((await probe(page))?.p95, 'the governor never sampled an animation').toBeNull()
  })
})
