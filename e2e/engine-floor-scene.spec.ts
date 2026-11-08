/*
 * W1-T18's acceptance checks for Back of House's 3D scene (`engine-floor`), in Playwright's Chromium, through `/play/engine-floor`:
 *
 *   1. At most 100 draw calls, read from the scene's own `renderer.info` (A§11.1), at T1 and at T2, over a whole practice level of the
 *      tallest practice house (Mini-SGLang: six storeys) from the first frame to the ticket home. (At most 40 KB gz is a build check:
 *      verify:bundle gates `scene-engine-floor`, and the task's result records the figure.)
 *   2. Reduced motion cuts between stops: a run puts the ticket where it stops at once, the camera that follows it cuts there, and then
 *      no animation frame is asked for.
 *   3. `V` keeps the session: the prediction, the laid path and what the run found are the same in 2D and back in 3D, and the scene draws
 *      the same route.
 *   And: `C` and the buttons reach every camera stop; the run's moment plays and then lets the frames go; a run sent from the stub far down
 *   the column plays in sight, the scene's column sticking on a wide screen and the camera taking the follow from the cutaway (the finish
 *   review's round 1); the capture is not blank; all text is DOM; no chit and no tape covers a name at the cutaway of the widest and the
 *   tallest houses (its round 2); and axe finds nothing serious on the 3D view.
 *
 * How it runs, as e2e/loop-scene.spec.ts does: one test build with `VITE_ES_TEST_HOOKS=1` (it exposes `window.__esScene` and honours
 * `?es-tier=<0-3>`), served by `context.route` so no server runs, with any request off the origin failing the test. Chromium renders
 * WebGL2 with SwiftShader, so CI needs no GPU.
 *
 *   npx playwright test e2e/engine-floor-scene.spec.ts
 *
 * `ES_CHROMIUM=<path to chrome>` runs it with another Chromium build than the one Playwright installed.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { build } from 'vite'
import { buildLevel } from '../packages/play/engine-floor/levels'
import type { FrameStats } from '../src/scene/stage-runtime'
import type { SceneHook } from '../src/scene/test-hook'
import { pixelStats } from './support/pixels'

declare global {
  interface Window {
    __raf?: number
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

base.use({
  launchOptions: {
    executablePath: process.env.ES_CHROMIUM || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
  viewport: { width: 1440, height: 900 },
})

base.beforeAll(async () => {
  dist = mkdtempSync(path.join(tmpdir(), 'es-floor-scene-'))
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

const stage = (page: Page) => page.locator('[data-stage="engine-floor"]')
const game = (page: Page) => page.locator('section[data-game="engine-floor"]')
const probe = (page: Page) => page.evaluate(() => window.__esScene?.probes['engine-floor']?.info() ?? null)
const camera = (page: Page) => page.getByRole('group', { name: 'Camera on the house' })
const reference = (level: string) => buildLevel(level, 0).reference

async function open(page: Page, level: string, tier: number) {
  await page.goto(`${ORIGIN}/play/engine-floor?level=${level}&es-tier=${tier}`)
  await page.evaluate(() => document.fonts.ready)
  await expect(game(page)).toBeVisible()
}

/** The scene pauses while it is scrolled away, so a test looks at it from the top of the page, with the game's keys in hand. */
async function home(page: Page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    document.querySelector<HTMLElement>('section[data-game="engine-floor"]')?.focus({ preventScroll: true })
  })
}

/**
 * Waits until the scene is drawn, the Stage says it is settled, and no frame has been drawn for a second and a half. A software renderer
 * on a loaded machine can take most of a second over one frame of the house, and the frame a change asks for after the one it is drawing
 * comes only when that one is done: half a second of quiet could fall between the two [measured 2026-11-05: a late frame about 0.9 s
 * after half a second's quiet, on SwiftShader under load].
 */
async function settle(page: Page) {
  await home(page)
  await expect(stage(page)).toHaveAttribute('data-stage-phase', 'live', { timeout: 60_000 })
  await expect(stage(page)).toHaveAttribute('data-settled', 'true', { timeout: 60_000 })
  let frames = -1
  await expect
    .poll(
      async () => {
        const now = (await probe(page))?.frames ?? -2
        const still = now === frames
        frames = now
        return still
      },
      { intervals: [1500], timeout: 60_000 },
    )
    .toBe(true)
}

async function frame(page: Page): Promise<FrameStats> {
  return page.evaluate(() => (window.__esScene as SceneHook).probes['engine-floor'].frame())
}

/** The prediction written down by its plate and its stub, as a visitor's taps do. */
async function commit(page: Page, n: number) {
  await page.getByRole('button', { name: `${n} ${n === 1 ? 'boundary' : 'boundaries'}` }).click()
  await page.getByRole('button', { name: 'Commit the prediction' }).click()
}

/** Lays stages by tapping their cards in the tray. */
async function lay(page: Page, ids: readonly string[]) {
  for (const id of ids) {
    const card = page.locator(`[data-floor-tray] [data-stage="${id}"]`)
    await card.click()
    await expect(card).toHaveCount(0)
  }
}

/** Sends the ticket with `R`, the house in view. */
async function run(page: Page) {
  await home(page)
  await page.keyboard.press('KeyR')
}

test.describe('the draw-call budget (A§11.1, D-023): at most 100', () => {
  for (const tier of [1, 2]) {
    test(`a whole level of the tallest practice house, from the first frame to the ticket home, draws in at most 100 calls, at T${tier}`, async ({ page }) => {
      test.setTimeout(300_000)
      await open(page, 'mini', tier)
      await settle(page)
      const frames: FrameStats[] = [await frame(page)]
      await commit(page, 3)
      await settle(page)
      frames.push(await frame(page))
      await lay(page, reference('mini'))
      await settle(page)
      frames.push(await frame(page))
      await run(page)
      await expect(page.locator('[data-live="outcome"]')).toHaveText('The run is over. The debrief is ready.')
      await settle(page)
      frames.push(await frame(page))
      const most = frames.reduce((a, b) => (b.sceneCalls > a.sceneCalls ? b : a))
      expect(most.sceneCalls).toBeLessThanOrEqual(100)
      expect(Math.max(...frames.map((stats) => stats.calls))).toBeLessThanOrEqual(100)
      console.log(
        `T${tier}: at most ${most.sceneCalls} scene draw calls (${Math.max(...frames.map((stats) => stats.calls))} in the frame, passes ${most.passes.join(' + ')}), ${Math.max(...frames.map((stats) => stats.instances))} instances, ${Math.max(...frames.map((stats) => stats.triangles))} triangles`,
      )
    })
  }
})

test.describe('the moment, on the bell (GAMES.md §5, "Motion")', () => {
  test('a run sends the ticket stage by stage, holding frames only while it moves, and stops at the first stage that does not hold, struck in red', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page, 'vllm', 2)
    await settle(page)
    await commit(page, 2)
    const path = reference('vllm')
    // The engine's own path to the copy back up, then its sync laid before the queue it waits on: the ticket stops there.
    await lay(page, [...path.slice(0, 13), path[14]])
    await settle(page)
    const before = (await probe(page))?.frames ?? 0
    await run(page)
    // While the ticket travels the scene is not still, and frames come.
    await expect(stage(page)).not.toHaveAttribute('data-settled', 'true', { timeout: 10_000 })
    await settle(page)
    // Frames came while it moved (a software renderer draws a few a second), and none once it stood.
    expect((await probe(page))?.frames ?? 0).toBeGreaterThan(before + 2)
    const struck = stage(page).locator('.es-floor-chit__n[data-state="struck"]')
    await expect(struck).toHaveCount(1)
    await expect(struck).toHaveText('14')
    await expect(stage(page).locator('.es-floor-chit__n[data-state="ran"]')).toHaveCount(13)
  })

  test('the stub pulled far down the column sends a run that is seen: the scene stays in sight on a wide screen, and the camera takes the follow from the cutaway', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page, 'vllm', 2)
    await settle(page)
    await commit(page, 2)
    await lay(page, reference('vllm').slice(0, 13))
    await settle(page)
    const stub = page.getByRole('button', { name: 'Run the path' })
    await stub.scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(400)
    // Scrolled to the stub, the 3D view is still whole in the viewport: its column sticks.
    const box = await stage(page).boundingBox()
    const height = page.viewportSize()?.height ?? 0
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0)
    expect((box?.y ?? 0) + (box?.height ?? Infinity)).toBeLessThanOrEqual(height)
    await expect(camera(page).locator('button[aria-pressed="true"]')).toHaveText('Cutaway')
    await stub.click()
    await expect(camera(page).locator('button[aria-pressed="true"]')).toHaveText('Follow the ticket')
    await expect(page.locator('[data-floor-path] li[data-state="ran"]')).toHaveCount(13)
    // The run plays where it is seen: frames come while the ticket travels, and the house settles where it stopped.
    await expect(stage(page)).not.toHaveAttribute('data-settled', 'true', { timeout: 10_000 })
    await expect(stage(page)).toHaveAttribute('data-settled', 'true', { timeout: 60_000 })
  })
})

test.describe('the views and the camera (A§6.8)', () => {
  test('`V` swaps 2D and 3D and keeps the session: the prediction, the laid path and what the run found, and the scene draws the same route', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page, 'vllm', 2)
    await settle(page)
    await expect(game(page)).toHaveAttribute('data-view', '3d')
    await commit(page, 2)
    await lay(page, reference('vllm').slice(0, 5))
    await run(page)
    await settle(page)
    const rows = () => page.locator('[data-floor-path] li[data-state]').evaluateAll((items) => items.map((item) => item.getAttribute('data-state')))
    const before = { prediction: await page.locator('[data-prediction]').textContent(), rows: await rows() }
    expect(before.rows).toEqual(['ran', 'ran', 'ran', 'ran', 'ran'])

    await home(page)
    await page.keyboard.press('KeyV')
    await expect(game(page)).toHaveAttribute('data-view', '2d')
    await expect(page.locator('[data-surface="2d"] [data-floor-view] svg')).toBeVisible()
    await expect(stage(page)).toHaveCount(0)
    expect({ prediction: await page.locator('[data-prediction]').textContent(), rows: await rows() }).toEqual(before)

    await home(page)
    await page.keyboard.press('KeyV')
    await expect(game(page)).toHaveAttribute('data-view', '3d')
    await settle(page)
    expect({ prediction: await page.locator('[data-prediction]').textContent(), rows: await rows() }).toEqual(before)
    // The scene draws the same route: a chit for each stage laid, every one inked.
    await expect(stage(page).locator('.es-floor-chit__n[data-state="ran"]')).toHaveCount(5)
  })

  test('`C` cycles every stop, the cutaway, a floor each and the follow, and each button reaches its own', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page, 'vllm', 2)
    await settle(page)
    await commit(page, 2)
    await settle(page)
    const names = ['Cutaway', 'The dining room · client', 'The host stand · api-server', 'The pass · engine-core', 'The line', 'Follow the ticket']
    await expect(camera(page).getByRole('button')).toHaveText(names)
    const pressed = () => camera(page).locator('button[aria-pressed="true"]').textContent()
    expect(await pressed()).toBe(names[0])
    for (const name of [...names.slice(1), names[0]]) {
      await home(page)
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

test.describe('the picture', () => {
  test('the 3D capture is not blank: its pixels vary, and it is kept as an artifact', async ({ page }, info) => {
    test.setTimeout(180_000)
    await open(page, 'inside', 2)
    await settle(page)
    await commit(page, 2)
    await lay(page, reference('inside').slice(0, 12))
    await settle(page)
    await page.addStyleTag({ content: '.es-labels { visibility: hidden !important; }' })
    const sampled = await pixelStats(page.context(), await stage(page).locator('canvas').screenshot())
    expect(sampled.colours).toBeGreaterThan(40)
    expect(sampled.spread).toBeGreaterThan(12)
    await page.addStyleTag({ content: '.es-labels { visibility: visible !important; }' })
    const shot = info.outputPath('engine-floor-3d.png')
    await stage(page).screenshot({ path: shot })
    await info.attach('engine-floor-3d', { path: shot, contentType: 'image/png' })
    console.log(`3D capture ${sampled.width}x${sampled.height}: ${sampled.colours} distinct colours in ${sampled.samples} samples, luma spread ${sampled.spread.toFixed(1)}; kept at ${shot}`)
  })

  test('all text is DOM: the floors\' and the hands\' tapes and the stages\' chits are page text over the canvas, which holds none', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page, 'vllm', 2)
    await settle(page)
    await commit(page, 2)
    await lay(page, reference('vllm').slice(0, 9))
    await settle(page)
    const labels = stage(page).locator('.es-labels')
    for (const words of ['THE DINING ROOM · CLIENT', 'THE HOST STAND · API-SERVER', 'THE PASS · ENGINE-CORE', 'THE LINE', 'input-thread', 'output-handler-task']) await expect(labels.getByText(words, { exact: true })).toHaveCount(1)
    await expect(labels.locator('.es-floor-chit__n')).toHaveCount(9)
    await expect(stage(page).locator('.es-stage__scene')).toHaveAttribute('aria-hidden', 'true')
    expect(await stage(page).locator('canvas').evaluate((canvas) => canvas.textContent)).toBe('')
  })

  test('no label covers a name: at the cutaway of the widest house and the tallest, every tape\'s words are clear of every chit and every other tape (the finish review\'s round 2)', async ({ page }) => {
    test.setTimeout(300_000)
    /** Each name's words, and what every other label shows: a chit's slip, a tape's strip; then each pair of a name's words and another label that meet. */
    const covered = () =>
      stage(page).evaluate((root) => {
        const seen = [...root.querySelectorAll<HTMLElement>('.es-label')].filter((label) => label.style.visibility === 'visible')
        const box = (node: Element) => node.getBoundingClientRect()
        const words = seen.flatMap((label) => {
          const text = label.querySelector('.es-tape__text')
          if (text) return [{ label, name: text.textContent ?? '', r: box(text) }]
          if (!label.classList.contains('es-floor-scene-strip')) return []
          const range = document.createRange()
          range.selectNodeContents(label)
          return [{ label, name: label.textContent ?? '', r: range.getBoundingClientRect() }]
        })
        const shown = seen.map((label) => ({ label, text: (label.textContent ?? '').trim(), r: box(label.querySelector('.es-tape, :scope > span') ?? label) }))
        return words.flatMap((name) =>
          shown
            .filter((other) => other.label !== name.label && Math.min(name.r.right, other.r.right) > Math.max(name.r.left, other.r.left) && Math.min(name.r.bottom, other.r.bottom) > Math.max(name.r.top, other.r.top))
            .map((other) => `${name.name} under ${other.text}`),
        )
      })
    await open(page, 'vllm', 2)
    await settle(page)
    await commit(page, 2)
    const path = reference('vllm')
    await lay(page, path.slice(0, 10))
    await settle(page)
    expect(await covered()).toEqual([])
    await lay(page, path.slice(10))
    await settle(page)
    expect(await covered()).toEqual([])
    await open(page, 'mini', 2)
    await settle(page)
    await commit(page, 3)
    await lay(page, reference('mini'))
    await settle(page)
    expect(await covered()).toEqual([])
  })

  test('axe finds no serious or critical violation on the 3D view', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page, 'vllm', 2)
    await settle(page)
    await commit(page, 2)
    await lay(page, reference('vllm').slice(0, 4))
    await settle(page)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze()
    const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(blocking.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' ; ')}`)).toEqual([])
  })
})

test.describe('reduced motion (A§6.9): every change cuts, and the camera cuts between its stops', () => {
  test.use({ reducedMotion: 'reduce' })

  test('a run puts the ticket where it stops at once, the camera that follows it cuts there, and then no animation frame is asked for', async ({ page, context }) => {
    test.setTimeout(180_000)
    await context.addInitScript(() => {
      window.__raf = 0
      const request = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = (callback: FrameRequestCallback) => {
        window.__raf = (window.__raf ?? 0) + 1
        return request(callback)
      }
    })
    await open(page, 'vllm', 1)
    await settle(page)
    await commit(page, 2)
    await camera(page).getByRole('button', { name: 'Follow the ticket' }).click()
    await lay(page, reference('vllm').slice(0, 13))
    await settle(page)
    await run(page)
    await expect(page.locator('[data-floor-path] li[data-state="ran"]')).toHaveCount(13)
    await settle(page)
    // The ticket and the camera are where the run left them, and the house is still: no frame is asked for after it settles.
    const after = await page.evaluate(() => window.__raf ?? 0)
    await page.waitForTimeout(2000)
    expect(await page.evaluate(() => window.__raf ?? 0)).toBe(after)
    expect((await probe(page))?.p95, 'the governor never sampled an animation').toBeNull()
    await expect(stage(page).locator('.es-floor-chit__n[data-state="ran"]')).toHaveCount(13)
  })
})
