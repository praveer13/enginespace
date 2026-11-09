/*
 * W1-T13's acceptance checks for the full service (TR2's levels and TR6's mask lane), in Playwright's Chromium, through `/play/loop`:
 *
 *   1. Every level can be won by keyboard: the prediction called, the lever set, the night served and the debrief opened, with no pointer,
 *      on the level's practice seed. The keys are the game's (`O`, `G`, `M`, `[` and `]`) and Tab, the arrows and Enter.
 *      W1-T14's graded `close` is one of them: its levers are the switches, the mode and the ladder of sizes, its closed book hides the mode a
 *      lever resolves to and the memory the routines take until the night is served, and a graded run draws its seed when it starts.
 *   And the 3D bar's budget (D-023, frozen): a whole night of a TR2 level draws in at most 100 calls, read from the scene's own
 *   `renderer.info`, at T1 and at T2, with the mold rack, the comb and the padding on the pass.
 *   (3. `scene-loop` at most 40 KB gz is verify:bundle's; the task's result records the measured size.)
 *   And the page's two columns: at 1440 px the mirror stands under the view's switches however long the column of controls beside it
 *   runs, the tape under the controls, and at 390 px the page reads in one column, in the order of the page and of the keyboard.
 *
 * How it runs, as e2e/loop-scene.spec.ts does: one test build with `VITE_ES_TEST_HOOKS=1` (it exposes `window.__esScene` and honours
 * `?es-tier=<0-3>`), served by `context.route` so no server runs, with any request off the origin failing the test. Chromium renders
 * WebGL2 with SwiftShader, so CI needs no GPU. The keyboard walks run in the 2D view (tier 0), which is the same session.
 *
 *   npx playwright test e2e/loop-full.spec.ts
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test as base, expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { build } from 'vite'
import { FULL_SERVICE } from '../packages/play/loop/entry'
import { buildFullLevel, MODES } from '../packages/play/loop/full/levels'
import type { FullLevelId } from '../packages/play/loop/full/types'
import type { FrameStats } from '../src/scene/stage-runtime'
import { pixelStats } from './support/pixels'
import type { SceneHook } from '../src/scene/test-hook'

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
  dist = mkdtempSync(path.join(tmpdir(), 'es-loop-full-'))
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

const game = (page: Page) => page.locator('section[data-game="loop"]')
const stage = (page: Page) => page.locator('[data-stage="loop"]')
const probe = (page: Page) => page.evaluate(() => window.__esScene?.probes.loop?.info() ?? null)

async function open(page: Page, level: string, tier: number) {
  await page.goto(`${ORIGIN}/play/loop?level=${level}&es-tier=${tier}`)
  await page.evaluate(() => document.fonts.ready)
  await expect(game(page)).toBeVisible()
  await expect(page.locator('[data-full-controls]')).toBeVisible({ timeout: 30_000 })
}

/** Presses Tab until `target` has focus: the keyboard's own path to it. */
async function tabTo(page: Page, target: Locator, most = 120) {
  for (let i = 0; i < most; i++) {
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`Tab never reached ${target}`)
}

/** Calls the stage's prediction with the keyboard: a number typed into its slip, or a choice pressed and torn off with the stub. */
async function call(page: Page, answer: number) {
  const field = page.locator('[data-full-prediction="open"] input')
  if ((await field.count()) > 0) {
    await tabTo(page, field)
    await page.keyboard.type(String(answer))
    await page.keyboard.press('Enter')
  } else {
    await tabTo(page, page.locator('[data-full-prediction="open"] [role="radio"]').nth(answer))
    await page.keyboard.press('Enter')
    await tabTo(page, page.getByRole('button', { name: 'Call it' }))
    await page.keyboard.press('Enter')
  }
  await expect(page.locator('[data-full-prediction="called"]')).toBeVisible()
}

/** Serves the rest of the night: Tab to the button, then Enter. */
async function serve(page: Page) {
  await tabTo(page, page.getByRole('button', { name: 'Serve the rest' }))
  await page.keyboard.press('Enter')
}

/** A key of the game's, pressed with focus inside the game but on no text field. */
async function key(page: Page, code: string) {
  const active = await page.evaluate(() => document.activeElement?.tagName ?? '')
  if (active === 'INPUT' || active === 'BODY') await tabTo(page, page.locator('[data-full-levers] button, [data-full-controls] .es-bell__button').first())
  await page.keyboard.press(code)
}

async function nextStage(page: Page, id: string) {
  await key(page, 'BracketRight')
  await expect(page.locator(`[data-stage-tab="${id}"][aria-current="step"]`)).toBeVisible()
}

async function debrief(page: Page) {
  await tabTo(page, page.getByRole('button', { name: 'See the debrief' }))
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-full-debrief]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-full-debrief]')).toContainText('Well served.')
}

/** Cycles the graph mode with `G` until the panel asks for `mode`. (`FULL` is the start of `FULL_DECODE_ONLY`, so the plate's word is matched whole.) */
async function mode(page: Page, wanted: string) {
  for (let i = 0; i < MODES.length; i++) {
    const asked = (await page.locator('[data-full-levers] [role="radio"][aria-checked="true"]').textContent()) ?? ''
    if (asked.split(' ')[0] === wanted) return
    await key(page, 'KeyG')
  }
  throw new Error(`G never reached ${wanted}`)
}

const LEVEL = (id: FullLevelId) => buildFullLevel(id, 0)

test.describe('acceptance check 1: every level can be won by keyboard (practice seed, 2D view)', () => {
  test('async: the next call written during the fire, on both cost cards', async ({ page }) => {
    test.setTimeout(180_000)
    const level = LEVEL('async')
    await open(page, 'async', 0)
    for (const [i, world] of level.stages.entries()) {
      if (i > 0) await nextStage(page, world.id)
      await call(page, world.answer)
      await key(page, 'KeyO')
      await expect(page.getByRole('switch', { name: /Write the next call during this fire/ })).toHaveAttribute('aria-checked', 'true')
      await serve(page)
      await expect(page.locator(`[data-stage-tab="${world.id}"] .es-full-stages__done`)).toHaveCount(1)
    }
    await debrief(page)
  })

  test('graphs: the comb folded into one word, the molds chosen on the ladder, and the mode the backend serves fastest', async ({ page }) => {
    test.setTimeout(240_000)
    const [comb, sizes, modes] = LEVEL('graphs').stages
    await open(page, 'graphs', 0)
    await call(page, comb.answer)
    await mode(page, comb.house.graphMode)
    await serve(page)

    await nextStage(page, 'sizes')
    await call(page, sizes.answer)
    // The ladder: take the naive molds off, then put the house's on, walking it with the arrows.
    const ladder = page.locator('[aria-label="Capture sizes"] button')
    await tabTo(page, page.locator('[aria-label="Capture sizes"] button[tabindex="0"]'))
    let at = Number(await page.evaluate(() => document.activeElement?.textContent)) - 1
    const go = async (size: number) => {
      while (at < size - 1) {
        await page.keyboard.press('ArrowRight')
        at += 1
      }
      while (at > size - 1) {
        await page.keyboard.press('ArrowLeft')
        at -= 1
      }
      await page.keyboard.press('Enter')
    }
    for (const size of sizes.start.captureSizes) await go(size)
    for (const size of sizes.house.captureSizes) await go(size)
    for (const size of sizes.house.captureSizes) await expect(ladder.nth(size - 1)).toHaveAttribute('aria-pressed', 'true')
    await serve(page)

    await nextStage(page, 'modes')
    await call(page, modes.answer)
    await mode(page, modes.house.graphMode)
    await serve(page)
    await debrief(page)
  })

  test('mrv2: the V2 runner on the small model, and either runner on the 70B card', async ({ page }) => {
    test.setTimeout(180_000)
    const [small, big] = LEVEL('mrv2').stages
    await open(page, 'mrv2', 0)
    await call(page, small.answer)
    await key(page, 'KeyM')
    await expect(page.getByRole('switch', { name: /The V2 runner/ })).toHaveAttribute('aria-checked', 'true')
    await serve(page)
    await nextStage(page, big.id)
    await call(page, big.answer)
    await serve(page)
    await debrief(page)
  })

  test('mask: the allergy card written during the fire', async ({ page }) => {
    test.setTimeout(180_000)
    const [mask] = LEVEL('mask').stages
    await open(page, 'mask', 0)
    await call(page, mask.answer)
    await key(page, 'KeyO')
    await expect(page.getByRole('switch', { name: /Write the allergy card during the fire/ })).toHaveAttribute('aria-checked', 'true')
    await serve(page)
    await debrief(page)
  })

  test('keys waits behind its card for the owner\'s tables', async ({ page }) => {
    await page.goto(`${ORIGIN}/play/loop?level=keys&es-tier=0`)
    await expect(page.locator('[data-keys-waiting="waiting"]')).toContainText("Waiting for the owner's tables")
  })
})

const CLOSE_SEED = FULL_SERVICE.find((level) => level.id === 'close')?.practiceSeed ?? 0

/** Toggles the plates of the capture ladder from the keyboard: Tab to the roving plate, the arrows to a size, Enter to press or lift it. */
async function pressSizes(page: Page, ladder: readonly number[], sizes: readonly number[]) {
  await tabTo(page, page.locator('[aria-label="Capture sizes"] button[tabindex="0"]'))
  let at = ladder.indexOf(Number(await page.evaluate(() => document.activeElement?.textContent)))
  for (const size of sizes) {
    const to = ladder.indexOf(size)
    for (; at < to; at++) await page.keyboard.press('ArrowRight')
    for (; at > to; at--) await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Enter')
  }
}

test.describe('W1-T14: `close`, the graded level', () => {
  test('is won by keyboard on its practice seed: the prediction, the switches, the mode and the ladder, one night, and the debrief', async ({ page }) => {
    test.setTimeout(240_000)
    const [world] = buildFullLevel('close', CLOSE_SEED).stages
    const ladder = world.ladder ?? []
    await open(page, 'close', 0)
    // Closed-book: the cards stand under the view, and the live readouts and the house's clock wait for the night.
    await expect(page.locator('[data-close-cards]')).toBeVisible()
    await expect(page.locator('[data-full-resolved]')).toHaveCount(0)
    await expect(page.locator('[data-full-memory]')).toHaveCount(0)
    await expect(game(page)).not.toContainText('against the house')
    await call(page, world.answer)
    await key(page, 'KeyO')
    await expect(page.getByRole('switch', { name: /Write the next call during this fire/ })).toHaveAttribute('aria-checked', String(world.house.async))
    await key(page, 'KeyM')
    await expect(page.getByRole('switch', { name: /The V2 runner/ })).toHaveAttribute('aria-checked', String(world.house.runner === 'mrv2'))
    await tabTo(page, page.getByRole('switch', { name: /The line fills the next call's input ids/ }))
    await page.keyboard.press('Space')
    await expect(page.getByRole('switch', { name: /The line fills the next call's input ids/ })).toHaveAttribute('aria-checked', String(world.house.inputIds === 'device'))
    await mode(page, world.house.graphMode)
    // The ladder: lift the engine's own sizes that the house does not drill, and press the house's.
    await pressSizes(page, ladder, world.start.captureSizes.filter((size) => !world.house.captureSizes.includes(size)))
    await pressSizes(page, ladder, world.house.captureSizes.filter((size) => !world.start.captureSizes.includes(size)))
    for (const size of ladder) {
      await expect(page.locator('[aria-label="Capture sizes"] button', { hasText: new RegExp(`^${size}$`) })).toHaveAttribute('aria-pressed', String(world.house.captureSizes.includes(size)))
    }
    // One ring serves the whole night, with no bell and no Auto.
    await expect(page.getByRole('button', { name: 'Auto' })).toHaveCount(0)
    await tabTo(page, page.getByRole('button', { name: 'Serve the night' }))
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-full-verdict="pass"]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-full-resolved]')).toHaveCount(1)
    await expect(page.locator('[data-full-memory]')).toHaveCount(1)
    await expect(game(page)).toContainText('against the house')
    await debrief(page)
    await expect(page.locator('[data-full-verdict-debrief]')).toContainText('The night meets the bar.')
  })

  test('a graded run draws its seed when it starts, has no undo, and serves one night that the debrief reads against the house', async ({ page }) => {
    test.setTimeout(240_000)
    await open(page, 'close', 0)
    await expect(game(page)).toHaveAttribute('data-mode', 'practice')
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
    await page.getByRole('button', { name: 'Start a graded run' }).click()
    await expect(game(page)).toHaveAttribute('data-mode', 'graded')
    await expect(page.locator('[data-full-mode="graded"]')).toContainText('A graded run: fresh numbers drawn now, no undo')
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
    // The naive configuration, served: a night that fails the bar, whatever the draw.
    await call(page, 50)
    await tabTo(page, page.getByRole('button', { name: 'Serve the night' }))
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-full-verdict]')).toBeVisible({ timeout: 30_000 })
    await tabTo(page, page.getByRole('button', { name: 'See the debrief' }))
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-full-debrief]')).toContainText('Serve it again.')
    await expect(page.locator('[data-full-debrief]')).toContainText('The lever worth the most:')
    await expect(page.locator('[data-full-config-table]')).toBeVisible()
    await page.getByRole('button', { name: 'Another graded run' }).click()
    await expect(game(page)).toHaveAttribute('data-mode', 'graded')
    await expect(page.locator('[data-full-prediction="open"]')).toBeVisible()
  })
})

/** Waits until the scene is drawn, the Stage says it is settled, and no frame has been drawn for half a second. */
async function settle(page: Page) {
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
      { intervals: [500], timeout: 60_000 },
    )
    .toBe(true)
}

async function frame(page: Page): Promise<FrameStats> {
  return page.evaluate(() => (window.__esScene as SceneHook).probes.loop.frame())
}

test.describe('the draw-call budget of the full service (A§11.1, D-023)', () => {
  for (const tier of [1, 2]) {
    test(`a night of the mold rack and the comb draws in at most 100 calls, at T${tier}`, async ({ page }) => {
      test.setTimeout(300_000)
      await open(page, 'graphs', tier)
      await settle(page)
      const [comb] = LEVEL('graphs').stages
      await call(page, comb.answer)
      await mode(page, 'FULL_AND_PIECEWISE')
      let most: FrameStats | null = null
      for (let fire = 0; fire < 12; fire++) {
        await page.getByRole('button', { name: /Ring the bell/ }).click()
        await settle(page)
        const stats = await frame(page)
        if (most === null || stats.sceneCalls > most.sceneCalls) most = stats
      }
      if (most === null) throw new Error('no frame was drawn')
      expect(most.sceneCalls).toBeLessThanOrEqual(100)
      expect(most.calls).toBeLessThanOrEqual(100)
      console.log(`full service T${tier}: at most ${most.sceneCalls} scene draw calls (${most.calls} in the frame, passes ${most.passes.join(' + ')}), ${most.instances} instances, ${most.triangles} triangles`)
    })
  }
})

/** Where the parts of the play stage stand on the page: each part's box, in page coordinates. */
async function parts(page: Page) {
  return page.evaluate(() => {
    const box = (element: Element | null | undefined) => {
      const rect = element?.getBoundingClientRect()
      return rect ? { top: rect.top + scrollY, bottom: rect.bottom + scrollY, left: rect.left, right: rect.right } : null
    }
    const panel = document.querySelector('[data-stage="play"]')
    const controls = document.querySelector('[data-shell-column="controls"]')?.firstElementChild
    return {
      view: box(document.querySelector('[data-surface]')),
      controls: box(controls),
      toolbar: box(document.querySelector('nav[aria-label="Stages of this game"]')),
      tape: box(controls?.nextElementSibling),
      mirror: box(panel),
    }
  })
}

test.describe('the page\'s two columns flow on their own', () => {
  test('at 1440 the mirror stands under the view\'s switches and the tape under the controls, on the longest column of controls', async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, 'graphs', 0)
    await nextStage(page, 'sizes')
    await call(page, LEVEL('graphs').stages[1].answer)
    const at = await parts(page)
    // The controls of the mold rack run longer than the view and its switches: the mirror does not wait for their foot.
    expect(at.controls!.bottom).toBeGreaterThan(at.toolbar!.bottom + 100)
    expect(at.mirror!.top - at.toolbar!.bottom).toBeLessThanOrEqual(40)
    expect(at.tape!.top - at.controls!.bottom).toBeLessThanOrEqual(40)
    expect(at.controls!.left).toBeGreaterThan(at.view!.right)
  })
})

test.describe('the pass on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('at 390 px the page reads in one column: the view, the controls, the tape, the view\'s switches, the mirror', async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, 'graphs', 0)
    const at = await parts(page)
    const tops = [at.view!.top, at.controls!.top, at.tape!.top, at.toolbar!.top, at.mirror!.top]
    expect(tops.every((top, i) => i === 0 || top > tops[i - 1])).toBe(true)
    expect(Math.max(at.view!.right, at.controls!.right, at.tape!.right, at.mirror!.right)).toBeLessThanOrEqual(390)
  })

  test('at 390 px the scene leads the page and draws the kitchen with its tools: the picture is not blank', async ({ page }) => {
    test.setTimeout(300_000)
    await open(page, 'graphs', 1)
    await settle(page)
    const [comb] = LEVEL('graphs').stages
    await call(page, comb.answer)
    await page.getByRole('button', { name: /Ring the bell/ }).click()
    // The bell stands under the scene on a phone: back to the top, where the pass leads the page, so the Stage draws and settles.
    await page.evaluate(() => window.scrollTo(0, 0))
    await settle(page)
    const box = await stage(page).boundingBox()
    expect(box?.y ?? 9999).toBeLessThan(844)
    const sampled = await pixelStats(page.context(), await stage(page).locator('canvas').screenshot())
    expect(sampled.colours).toBeGreaterThan(40)
    expect(sampled.spread).toBeGreaterThan(12)
  })
})
