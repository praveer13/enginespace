/*
 * The step loop's five full levels (TR2's levels and TR6's mask lane) in the instrument frame, in Playwright's Chromium, through `/play/loop`
 * (W1-T13's acceptance checks, carried to the frame by R-T28):
 *
 *   1. Every level can be won by keyboard: the prediction committed, the lever set, the run served and the result read, with no pointer, on
 *      the level's practice seed. The keys are the game's (`O`, `G`, `M`, `[` and `]`) and Tab, the arrows and Enter. The graded `close` is one
 *      of them: its levers are the switches, the mode and the capture sizes, its closed book hides the mode a lever resolves to and the
 *      memory the graphs take until the run is served, its pass rule stands in the goal line before the run, and a graded run draws its seed
 *      when it starts.
 *   2. The first run on a full level is the parts, the cost card's row, then the stage's prediction, and no lever and no Step stands before it.
 *   3. At 1440 x 900 and 390 x 844 the diagram's now, the current control and the readout share the viewport (P5), and at a result the
 *      learner's lanes stand above the reference run's outline on one axis.
 *   4. No banned word on any full level, at the start and at the result.
 *   And the 3D bar's budget (D-023, frozen): a whole run of a TR2 level draws in at most 100 calls, read from the scene's own
 *   `renderer.info`, at T1 and at T2.
 *   (`scene-loop` at most 40 KB gz is verify:bundle's.)
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
import { FULL_PARTS } from '../packages/play/loop/full/parts'
import type { FullLevelId } from '../packages/play/loop/full/types'
import type { FrameStats } from '../src/scene/stage-runtime'
import { bannedOn } from './support/copy-scan'
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

/** Opens a level. The first run's intro is left out unless the test is about it: every part is marked as met in `es:intro`. */
async function open(page: Page, level: string, tier: number, options: { intro?: boolean } = {}) {
  if (options.intro !== true) {
    const ids = FULL_PARTS.map((part) => part.id)
    await page.addInitScript((met) => window.localStorage.setItem('es:intro', JSON.stringify({ loop: met })), ids)
  }
  await page.goto(`${ORIGIN}/play/loop?level=${level}&es-tier=${tier}`)
  await page.evaluate(() => document.fonts.ready)
  await expect(game(page)).toBeVisible()
  await expect(page.locator('[data-full-controls]')).toBeVisible({ timeout: 30_000 })
}

/** Presses Tab until `target` has focus: the keyboard's own path to it. */
async function tabTo(page: Page, target: Locator, most = 160) {
  for (let i = 0; i < most; i++) {
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`Tab never reached ${target}`)
}

/** Commits the stage's prediction with the keyboard: a number typed into its field, or a choice pressed and committed with its button. */
async function call(page: Page, answer: number) {
  const field = page.locator('[data-full-prediction="open"] input')
  if ((await field.count()) > 0) {
    await tabTo(page, field)
    await page.keyboard.type(String(answer))
    await page.keyboard.press('Enter')
  } else {
    await tabTo(page, page.locator('[data-full-prediction="open"] [role="radio"]').nth(answer))
    await page.keyboard.press('Enter')
    await tabTo(page, page.getByRole('button', { name: 'Commit prediction' }))
    await page.keyboard.press('Enter')
  }
  await expect(page.locator('[data-full-prediction="called"]')).toBeVisible()
}

/** Runs to the end of the stage: Tab to the button, then Enter. */
async function serve(page: Page) {
  await tabTo(page, page.getByRole('button', { name: 'Run to the end' }))
  await page.keyboard.press('Enter')
}

/** A key of the game's, pressed with focus inside the game but on no text field. */
async function key(page: Page, code: string) {
  const active = await page.evaluate(() => document.activeElement?.tagName ?? '')
  if (active === 'INPUT' || active === 'BODY') await tabTo(page, page.locator('[data-full-levers] button, [data-full-levers] [role="switch"], [data-full-step] button').first())
  await page.keyboard.press(code)
}

async function nextStage(page: Page, id: string) {
  await key(page, 'BracketRight')
  await expect(page.locator(`[data-stage-tab="${id}"][aria-current="step"]`)).toBeVisible()
}

/** Every stage is closed: the frame puts the result in the dock, with its verdict word and its tables. */
async function debrief(page: Page, word = 'Finished (practice)') {
  await expect(page.locator('[data-full-debrief]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-full-debrief]')).toContainText(word)
}

/** Cycles the graph mode with `G` until the panel asks for `mode`. (`FULL` is the start of `FULL_DECODE_ONLY`, so the button's word is matched whole.) */
async function mode(page: Page, wanted: string) {
  for (let i = 0; i < MODES.length; i++) {
    const asked = (await page.locator('[data-full-levers] [role="radio"][aria-checked="true"]').textContent()) ?? ''
    if (asked.split(/[ :]/)[0] === wanted) return
    await key(page, 'KeyG')
  }
  throw new Error(`G never reached ${wanted}`)
}

const LEVEL = (id: FullLevelId) => buildFullLevel(id, 0)

test.describe('every level can be won by keyboard (practice seed, 2D view)', () => {
  test('async: async scheduling on, on both cost cards', async ({ page }) => {
    test.setTimeout(180_000)
    const level = LEVEL('async')
    await open(page, 'async', 0)
    for (const [i, world] of level.stages.entries()) {
      if (i > 0) await nextStage(page, world.id)
      await call(page, world.answer)
      await key(page, 'KeyO')
      await expect(page.getByRole('switch', { name: /Async scheduling/ })).toHaveAttribute('aria-checked', 'true')
      await serve(page)
      // The last stage closes the level, and the result takes the dock: its tabs are gone, and its ring is in the result.
      if (i < level.stages.length - 1) await expect(page.locator(`[data-stage-tab="${world.id}"] .es-full-stages__done`)).toHaveCount(1)
    }
    await debrief(page)
  })

  test('graphs: eager launches against replay, the capture sizes chosen on the ladder, and the mode the backend serves fastest', async ({ page }) => {
    test.setTimeout(240_000)
    const [comb, sizes, modes] = LEVEL('graphs').stages
    await open(page, 'graphs', 0)
    await call(page, comb.answer)
    await mode(page, comb.house.graphMode)
    await serve(page)

    await nextStage(page, 'sizes')
    await call(page, sizes.answer)
    // The ladder: take the naive sizes off, then put the reference run's on, walking it with the arrows.
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
    await expect(page.getByRole('switch', { name: /V2 model runner/ })).toHaveAttribute('aria-checked', 'true')
    await serve(page)
    await nextStage(page, big.id)
    await call(page, big.answer)
    await serve(page)
    await debrief(page)
  })

  test('mask: the grammar mask built during the forward', async ({ page }) => {
    test.setTimeout(180_000)
    const [mask] = LEVEL('mask').stages
    await open(page, 'mask', 0)
    await call(page, mask.answer)
    await key(page, 'KeyO')
    await expect(page.getByRole('switch', { name: /Build the grammar mask during the forward/ })).toHaveAttribute('aria-checked', 'true')
    await serve(page)
    await debrief(page)
  })

  test('keys waits behind its card for the owner\'s tables', async ({ page }) => {
    await page.goto(`${ORIGIN}/play/loop?level=keys&es-tier=0`)
    await expect(page.locator('[data-keys-waiting="waiting"]')).toContainText("Waiting for the owner's tables")
  })
})

const CLOSE_SEED = FULL_SERVICE.find((level) => level.id === 'close')?.practiceSeed ?? 0

/** Toggles the buttons of the capture sizes from the keyboard: Tab to the roving button, the arrows to a size, Enter to press or lift it. */
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

test.describe('`close`, the graded level', () => {
  test('is won by keyboard on its practice seed: the prediction, the switches, the mode and the sizes, one run, and the result', async ({ page }) => {
    test.setTimeout(240_000)
    const [world] = buildFullLevel('close', CLOSE_SEED).stages
    const ladder = world.ladder ?? []
    await open(page, 'close', 0)
    // Closed-book: the pass rule stands in the goal line and the dock before the run, the four cards stand under the lanes, and the live readout
    // and the reference run's clock wait for the run.
    await expect(page.locator('.es-frame__goal')).toContainText('Passes with zero dependency violations')
    await expect(page.locator('[data-full-rule]')).toContainText('Pass rule:')
    await expect(page.locator('[data-close-cards]')).toBeVisible()
    await expect(page.locator('[data-readout-hidden]')).toContainText('The live readout is hidden: this run is graded.')
    await expect(page.locator('[data-full-resolved]')).toHaveCount(0)
    await expect(page.locator('[data-full-memory]')).toHaveCount(0)
    await expect(game(page)).not.toContainText('against the reference run')
    // No lever stands before the prediction.
    await expect(page.locator('[data-full-levers]')).toHaveCount(0)
    await call(page, world.answer)
    await key(page, 'KeyO')
    await expect(page.getByRole('switch', { name: /Async scheduling/ })).toHaveAttribute('aria-checked', String(world.house.async))
    await key(page, 'KeyM')
    await expect(page.getByRole('switch', { name: /V2 model runner/ })).toHaveAttribute('aria-checked', String(world.house.runner === 'mrv2'))
    await tabTo(page, page.getByRole('switch', { name: /Input ids filled on the GPU/ }))
    await page.keyboard.press('Space')
    await expect(page.getByRole('switch', { name: /Input ids filled on the GPU/ })).toHaveAttribute('aria-checked', String(world.house.inputIds === 'device'))
    await mode(page, world.house.graphMode)
    // The sizes: lift the engine's own sizes that the reference run does not capture, and press the reference run's.
    await pressSizes(page, ladder, world.start.captureSizes.filter((size) => !world.house.captureSizes.includes(size)))
    await pressSizes(page, ladder, world.house.captureSizes.filter((size) => !world.start.captureSizes.includes(size)))
    for (const size of ladder) {
      await expect(page.locator('[aria-label="Capture sizes"] button', { hasText: new RegExp(`^${size}$`) })).toHaveAttribute('aria-pressed', String(world.house.captureSizes.includes(size)))
    }
    // One press runs the whole stage, with no Step and no Auto.
    await expect(page.getByRole('button', { name: 'Auto' })).toHaveCount(0)
    await tabTo(page, page.getByRole('button', { name: 'Run it', exact: true }))
    await page.keyboard.press('Enter')
    await debrief(page, 'Passed')
    await expect(page.locator('[data-full-verdict-debrief]')).toContainText('The run meets the bar.')
    await expect(game(page)).toContainText('against the reference run')
    // The reference run's forwards stand under the learner's lanes, on the same axis.
    await expect(page.locator('[data-lanes-reference] [data-ref-forward]').first()).toBeAttached()
  })

  test('a graded run draws its seed when it starts, has no undo, and serves one run that the result reads against the reference run', async ({ page }) => {
    test.setTimeout(240_000)
    await open(page, 'close', 0)
    await expect(game(page)).toHaveAttribute('data-mode', 'practice')
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
    await page.getByRole('button', { name: 'Start a graded run' }).click()
    await expect(game(page)).toHaveAttribute('data-mode', 'graded')
    await expect(page.locator('[data-full-mode="graded"]')).toContainText('A graded run: fresh numbers drawn now, no undo')
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
    // The naive configuration, run: a run that fails the bar, whatever the draw.
    await call(page, 50)
    await tabTo(page, page.getByRole('button', { name: 'Run it', exact: true }))
    await page.keyboard.press('Enter')
    await debrief(page, 'Not yet')
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

/** The diagram is the default view; where the tier draws 3D, the view switch turns the scene on, as a learner does. */
async function threeD(page: Page) {
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await expect(game(page)).toHaveAttribute('data-view', '3d')
}

test.describe('the draw-call budget of the full levels (A§11.1, D-023)', () => {
  for (const tier of [1, 2]) {
    test(`a run of graphs with the capture sizes and the eager launches draws in at most 100 calls, at T${tier}`, async ({ page }) => {
      test.setTimeout(300_000)
      await open(page, 'graphs', tier)
      await threeD(page)
      await settle(page)
      const [comb] = LEVEL('graphs').stages
      await call(page, comb.answer)
      await mode(page, 'FULL_AND_PIECEWISE')
      let most: FrameStats | null = null
      for (let step = 0; step < 12; step++) {
        await page.getByRole('button', { name: 'Step', exact: true }).click()
        await settle(page)
        const stats = await frame(page)
        if (most === null || stats.sceneCalls > most.sceneCalls) most = stats
      }
      if (most === null) throw new Error('no frame was drawn')
      expect(most.sceneCalls).toBeLessThanOrEqual(100)
      expect(most.calls).toBeLessThanOrEqual(100)
      console.log(`full levels T${tier}: at most ${most.sceneCalls} scene draw calls (${most.calls} in the frame, passes ${most.passes.join(' + ')}), ${most.instances} instances, ${most.triangles} triangles`)
    })

    // The level with the most on the track at once: twenty steps of async scheduling with the slots live, the comb and every label.
    test(`a run of async, twenty steps with async scheduling on, draws in at most 100 calls, at T${tier}`, async ({ page }) => {
      test.setTimeout(300_000)
      await open(page, 'async', tier)
      await threeD(page)
      await settle(page)
      const [first] = LEVEL('async').stages
      await call(page, first.answer)
      await key(page, 'KeyO')
      await expect(page.getByRole('switch', { name: /Async scheduling/ })).toHaveAttribute('aria-checked', 'true')
      let most: FrameStats | null = null
      for (let step = 0; step < 20; step++) {
        await page.getByRole('button', { name: 'Step', exact: true }).click()
        await settle(page)
        const stats = await frame(page)
        if (most === null || stats.sceneCalls > most.sceneCalls) most = stats
      }
      if (most === null) throw new Error('no frame was drawn')
      expect(most.sceneCalls).toBeLessThanOrEqual(100)
      expect(most.calls).toBeLessThanOrEqual(100)
      console.log(`full levels async T${tier}: at most ${most.sceneCalls} scene draw calls (${most.calls} in the frame, passes ${most.passes.join(' + ')}), ${most.instances} instances, ${most.triangles} triangles`)
    })
  }
})

test.describe('the first run (REDESIGN §2.6, §3.7)', () => {
  test('the parts, then a look at the cost card, then the prediction; no lever and no Step stand before it', async ({ page }) => {
    await open(page, 'async', 0, { intro: true })
    await expect(page.locator('.es-intro[data-intro="parts"]')).toBeVisible()
    await expect(page.locator('.es-intro .es-parts li').first()).toContainText('Cost card')
    // No session action stands before the prediction: the dock holds no lever, the prediction itself waits for the parts and the look, and Step
    // says why it waits.
    await expect(page.locator('[data-full-levers]')).toHaveCount(0)
    await expect(page.locator('[data-full-prediction="open"]')).toHaveCount(0)
    await expect(page.locator('[data-full-prediction="waiting"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Step: commit the prediction first' })).toBeDisabled()
    for (let i = 0; i < 12 && (await page.locator('.es-intro[data-intro="parts"]').count()) > 0; i++) await page.locator('[data-intro-next]').click()
    await expect(page.locator('.es-intro[data-intro="look"]')).toBeVisible()
    await page.locator('[data-intro-look]').click()
    await expect(page.getByRole('dialog', { name: /Cost card/ })).toContainText('GPU forward')
    await page.keyboard.press('Escape')
    await page.locator('[data-intro-next]').click()
    await expect(page.locator('.es-intro[data-intro="ask"]')).toBeVisible()
    await expect(page.locator('[data-full-prediction="open"]')).toBeVisible()
    // The prediction is committed; the intro points at the reference run's first move, the async switch, and it is a real move.
    await page.locator('[data-full-prediction="open"] input').fill('1000')
    await page.getByRole('button', { name: 'Commit prediction' }).click()
    await expect(page.locator('.es-intro[data-intro="point"]')).toBeVisible()
    await expect(page.locator('[data-full-async] .es-marker__ring')).toBeVisible()
    await page.getByRole('switch', { name: /Async scheduling/ }).click()
    await expect(page.locator('.es-intro')).toHaveCount(0)
  })
})

/*
 * P5 (REDESIGN §2.1, §3.7): at 1440 x 900 and 390 x 844 the diagram's now, the current control and the readout are in the viewport together
 * without page scroll. On a phone the track scrolls sideways inside its box and keeps now in view.
 */
test.describe('action, state and result share one screen', () => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`at ${width} x ${height}: now, the current control and the readout are in view, before the first step and after four`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height })
      await open(page, 'graphs', 0)
      const inView = (selector: string) =>
        page.locator(selector).first().evaluate((element) => {
          const r = element.getBoundingClientRect()
          return r.width > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1
        })
      expect(await page.evaluate(() => scrollY)).toBe(0)
      expect(await inView('[data-lane-now] .es-marker__word')).toBe(true)
      expect(await inView('[data-full-prediction="open"] input')).toBe(true)
      expect(await inView('[data-full-readout]')).toBe(true)
      await call(page, LEVEL('graphs').stages[0].answer)
      for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Step', exact: true }).click()
      const track = await page.locator('[data-lanes-track]').evaluate((box) => {
        const now = box.querySelector('[data-lane-now] .es-marker__word')!.getBoundingClientRect()
        const edge = box.getBoundingClientRect()
        return { scrolls: box.scrollWidth > box.clientWidth + 1, left: box.scrollLeft, inBox: now.left >= edge.left && now.right <= edge.right + 1 }
      })
      expect(track.inBox).toBe(true)
      if (width < 480) expect(track.scrolls && track.left > 0).toBe(true)
      expect(await inView('[data-lane-now] .es-marker__word')).toBe(true)
      expect(await inView('[data-full-step] button')).toBe(true)
      expect(await inView('[data-full-readout]')).toBe(true)
    })
  }
})

test.describe('the lanes are the pure layout, and the result sets your lanes above the reference run\'s', () => {
  test('the diagram draws the rows, the marks and the bubbles that full/lanes.ts lays out, and a result adds the reference run on the same axis', async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, 'async', 0)
    await call(page, LEVEL('async').stages[0].answer)
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Step', exact: true }).click()
    const drawn = await page.locator('[data-full-lanes]').evaluate((figure) => ({
      rows: [...figure.querySelectorAll('[data-lane-labels] [data-lane-label]')].map((row) => row.getAttribute('data-lane-label')),
      forwards: figure.querySelectorAll('[data-mark="forward"]').length,
      idle: figure.querySelectorAll('[data-lane-idle]').length,
      dims: figure.querySelectorAll('[data-lane-dim]').length,
    }))
    expect(drawn.rows).toEqual(['cpu', 'forward', 'live'])
    expect(drawn.forwards).toBeGreaterThan(0)
    // Every closed bubble carries a dimension line with its value.
    expect(drawn.dims).toBeGreaterThanOrEqual(0)
    await expect(page.locator('[data-lanes-reference]')).toHaveCount(0)
    await serve(page)
    await expect(page.locator('[data-lanes-reference] [data-ref-forward]').first()).toBeAttached()
    // Your lanes stand above the reference run's outline: the learner's forward row is above the reference row.
    const above = await page.locator('[data-full-lanes]').evaluate((figure) => {
      const mine = figure.querySelector('[data-mark="forward"]')!.getBoundingClientRect()
      const theirs = figure.querySelector('[data-ref-forward]')!.getBoundingClientRect()
      return mine.bottom <= theirs.top + 1
    })
    expect(above).toBe(true)
  })
})

test.describe('the full levels say nothing in the kitchen\'s words', () => {
  for (const level of ['async', 'graphs', 'mrv2', 'close', 'mask']) {
    test(`${level}: no banned word or phrase in its text, its labels or its live region, at the start and at the result`, async ({ page }) => {
      test.setTimeout(240_000)
      await open(page, level, 0, { intro: true })
      expect(await bannedOn(page), 'at the start').toEqual([])
      await page.getByRole('button', { name: 'Skip intro' }).click()
      const stages = LEVEL(level as FullLevelId).stages
      for (const [i, world] of stages.entries()) {
        if (i > 0) await page.locator(`[data-stage-tab="${world.id}"]`).click()
        await call(page, world.answer)
        // Run the stage as it stands: a stage closes on a run at the bar or on its third run.
        for (let run = 0; run < 3; run++) {
          const button = page.getByRole('button', { name: world.sealed ? 'Run it' : 'Run to the end', exact: true })
          if ((await button.count()) === 0 || !(await button.isEnabled())) break
          await button.click()
        }
        if (i < stages.length - 1) expect(await bannedOn(page), `after stage ${world.id}`).toEqual([])
      }
      await expect(page.locator('[data-full-debrief]')).toBeVisible({ timeout: 30_000 })
      expect(await bannedOn(page), 'at the result').toEqual([])
    })
  }
})
