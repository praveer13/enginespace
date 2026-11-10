/*
 * W1b-T01, acceptance 2: with two game blocks open on one page, only one 3D canvas is live at a time (A§6.4, src/scene/lease.ts). The
 * level the learner started last takes the page's 3D view, the one it took it from shows its 2D view with the Stage's button, and that
 * button takes it back. And the 3D bar's budget in a lesson (D-023, frozen): an embedded scene draws inside A§11.1's 100 calls, read
 * from its own `renderer.info`, at T1 and at T2, and draws what it draws on the game's own page.
 *
 * How it runs, as e2e/loop-full.spec.ts does: one test build with `VITE_ES_TEST_HOOKS=1` (it exposes `window.__esScene` and honours
 * `?es-tier=<0-3>`), served by `context.route` so no server runs, with any request off the origin failing the test. Chromium renders
 * WebGL2 with SwiftShader, so no GPU is needed.
 *
 *   npx playwright test e2e/lesson-games-scene.spec.ts
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { build } from 'vite'
import type { SceneHook } from '../src/scene/test-hook'
import { embedOf, startBlock, ticketOf } from './support/lessons'

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
  dist = mkdtempSync(path.join(tmpdir(), 'es-lesson-games-'))
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

const ROUTE = '/m/tr2/l3-async-scheduling-closes-the-bubble'
const FIRST = { game: 'loop', level: 'first-4-par', mode: 'practice' } as const
const SECOND = { game: 'loop', level: 'async', mode: 'practice' } as const

/** The page's Stages, in the order of the page: each block's phase (`live`, `waiting` for the lease, `loading`). */
const phases = (page: Page) => page.locator('.es-stage').evaluateAll((stages) => stages.map((stage) => (stage as HTMLElement).dataset.stagePhase ?? ''))
const stageOf = (page: Page, block: typeof FIRST | typeof SECOND) => embedOf(page, block).locator('.es-stage')

async function openLesson(page: Page, tier: number) {
  await page.goto(`${ORIGIN}${ROUTE}?es-tier=${tier}`)
  await page.evaluate(() => document.fonts.ready)
  await expect(ticketOf(page, FIRST)).toBeVisible()
}


test.describe('one live 3D canvas on a page of two games (acceptance 2)', () => {
  test('the level started last takes the 3D view, the other shows its 2D view and the button that takes it back, and one canvas is live throughout', async ({ page }) => {
    test.setTimeout(240_000)
    await openLesson(page, 2)
    // No canvas before a level starts: the lesson's first paint holds no scene.
    expect(await page.locator('canvas').count()).toBe(0)

    await startBlock(page, FIRST)
    await expect(stageOf(page, FIRST)).toHaveAttribute('data-stage-phase', 'live', { timeout: 90_000 })
    expect(await page.locator('canvas').count()).toBe(1)

    await startBlock(page, SECOND)
    await expect(stageOf(page, SECOND)).toHaveAttribute('data-stage-phase', 'live', { timeout: 90_000 })
    await expect(stageOf(page, FIRST)).toHaveAttribute('data-stage-phase', 'waiting')
    expect(await phases(page)).toEqual(['waiting', 'live'])
    expect(await page.locator('canvas').count()).toBe(1)
    // The first game shows its 2D view and says why, with the way back to 3D.
    const back = stageOf(page, FIRST).getByRole('button', { name: 'Open this one in 3D' })
    await expect(stageOf(page, FIRST).locator('[data-note="held"]')).toContainText('Another 3D view is open on this page.')

    await back.click()
    await expect(stageOf(page, FIRST)).toHaveAttribute('data-stage-phase', 'live', { timeout: 90_000 })
    await expect(stageOf(page, SECOND)).toHaveAttribute('data-stage-phase', 'waiting')
    expect(await phases(page)).toEqual(['live', 'waiting'])
    expect(await page.locator('canvas').count()).toBe(1)
    // Each game kept its own session through it all: both are still at the start of their run, on their own level.
    await expect(embedOf(page, FIRST)).toHaveAttribute('data-level', 'first-4-par')
    await expect(embedOf(page, SECOND)).toHaveAttribute('data-level', 'async')
  })
})

/** A block of each game with a scene, in a lesson that holds it, and the stage id its scene's probe goes by. */
const SCENES = [
  { route: ROUTE, block: FIRST, name: 'Service, First service', probe: 'loop' },
  { route: ROUTE, block: SECOND, name: 'Service, the full service', probe: 'loop' },
  { route: '/m/tr1/l1-five-mechanisms', block: { game: 'engine-floor', level: 'nano', mode: 'practice' }, name: 'Back of House', probe: 'engine-floor' },
  { route: '/m/tr5a/l1-why-one-model-needs-several-kv-caches', block: { game: 'pool', level: 'one-group', mode: 'practice' }, name: 'The Reach-In', probe: 'pool' },
  { route: '/m/tr6/l2-the-rejection-sampler-exactly', block: { game: 'verifier', level: 'overlap', mode: 'practice' }, name: 'The Tasting', probe: 'verifier' },
] as const

test.describe("an embedded scene's budget (D-023, frozen; A§11.1: 100 draw calls)", () => {
  for (const { route, block, name, probe } of SCENES) {
    for (const tier of [1, 2]) {
      test(`${name} (${block.level}) in the lesson at T${tier}: at most 100 draw calls`, async ({ page }) => {
        test.setTimeout(180_000)
        await page.goto(`${ORIGIN}${route}?es-tier=${tier}`)
        await page.evaluate(() => document.fonts.ready)
        await startBlock(page, block)
        const stage = embedOf(page, block).locator('.es-stage')
        await expect(stage).toHaveAttribute('data-stage-phase', 'live', { timeout: 90_000 })
        await expect(stage).toHaveAttribute('data-settled', 'true', { timeout: 60_000 })
        const stats = await page.evaluate((id) => (window.__esScene as SceneHook).probes[id].frame(), probe)
        expect(stats.sceneCalls).toBeLessThanOrEqual(100)
        expect(stats.calls).toBeLessThanOrEqual(100)
        console.log(`${name} (${block.level}) in the lesson at T${tier}: ${stats.sceneCalls} scene draw calls (${stats.calls} in the frame, passes ${stats.passes.join(' + ')}), ${stats.instances} instances, ${stats.triangles} triangles, DPR ${stats.dpr}`)
      })
    }
  }
})
